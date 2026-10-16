import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { ID, InvoiceLine, Product } from '../types';
import { clientName, createInvoice, invoiceTotals, isOverdue, markInvoicePaid, outstanding, revenueBetween, voidInvoice } from '../logic';
import { fmtDate, fmtMoney, uid } from '../utils';
import { Badge, Empty, Field, Modal, Stat, Tabs } from '../components/ui';
import { SellPackageModal } from './ClientDetail';

type Tab = 'invoices' | 'packages' | 'reports';

function InvoiceView({ id, onClose }: { id: ID; onClose: () => void }) {
  const { db, update } = useStore();
  const [method, setMethod] = useState('Card');
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return null;
  const c = db.clients.find((x) => x.id === inv.clientId);
  const t = invoiceTotals(inv, db.settings.taxRatePct);
  const cur = db.settings.currency;
  return (
    <Modal title={`Invoice #${inv.number}`} onClose={onClose} wide>
      <div className="invoice printable">
        <div className="invoice-head">
          <div>
            <h2>{db.settings.businessName}</h2>
            <div className="muted">{db.settings.trainerName}</div>
          </div>
          <div className="right">
            <h2>INVOICE #{inv.number}</h2>
            <div>Issued {fmtDate(inv.issuedAt)}</div>
            <div>Due {fmtDate(inv.dueAt)}</div>
          </div>
        </div>
        <p>
          <strong>Bill to:</strong> {c ? `${c.firstName} ${c.lastName}` : 'Unknown'}
          {c?.email && <span className="muted"> · {c.email}</span>}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{fmtMoney(l.unitPrice, cur)}</td>
                <td className="num">{fmtMoney(l.qty * l.unitPrice, cur)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="num">Subtotal</td>
              <td className="num">{fmtMoney(t.subtotal, cur)}</td>
            </tr>
            {db.settings.taxRatePct > 0 && (
              <tr>
                <td colSpan={3} className="num">Tax ({db.settings.taxRatePct}%)</td>
                <td className="num">{fmtMoney(t.tax, cur)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={3} className="num">
                <strong>Total</strong>
              </td>
              <td className="num">
                <strong>{fmtMoney(t.total, cur)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
        {inv.status === 'paid' && (
          <p className="paid-stamp">
            PAID {inv.paidAt && fmtDate(inv.paidAt)} · {inv.method}
          </p>
        )}
        {inv.status === 'void' && <p className="paid-stamp void">VOID</p>}
      </div>
      <div className="actions spread no-print">
        <button className="btn ghost" onClick={() => window.print()}>
          Print / PDF
        </button>
        {inv.status === 'sent' && (
          <div className="actions">
            <button className="btn ghost danger" onClick={() => confirm('Void this invoice? Any unused package it issued will be withdrawn.') && update((d) => voidInvoice(d, inv.id), `Voided invoice #${inv.number}`)}>
              Void
            </button>
            <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
              <option>Card</option>
              <option>Cash</option>
              <option>Bank transfer</option>
            </select>
            <button className="btn primary" onClick={() => update((d) => markInvoicePaid(d, inv.id, method, new Date()), `Recorded ${method.toLowerCase()} payment for invoice #${inv.number}${c ? ` (${c.firstName} ${c.lastName})` : ''}`)}>
              Record payment
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NewInvoiceModal({ onClose }: { onClose: () => void }) {
  const { db, update } = useStore();
  const [clientId, setClientId] = useState(db.clients[0]?.id ?? '');
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: '', qty: 1, unitPrice: 0 }]);
  const [dueDays, setDueDays] = useState(7);
  const setLine = (i: number, patch: Partial<InvoiceLine>) => setLines(lines.map((l, j) => (i === j ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  return (
    <Modal title="New invoice" onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = lines.filter((l) => l.description.trim());
          if (update((d) => void createInvoice(d, clientId, clean, new Date(), dueDays), `Created an invoice for ${clientName(db, clientId)}`)) onClose();
        }}
      >
        <div className="row">
          <Field label="Client">
            <select required value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {db.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due in (days)">
            <input type="number" min={0} value={dueDays} onChange={(e) => setDueDays(+e.target.value)} />
          </Field>
        </div>
        <p className="muted small">
          To sell session credits, use <strong>Sell package</strong> instead — it issues the credits too.
        </p>
        {lines.map((l, i) => (
          <div className="row line" key={i}>
            <input placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <input type="number" min={1} className="narrow" value={l.qty} onChange={(e) => setLine(i, { qty: +e.target.value })} aria-label="Quantity" />
            <input type="number" min={0} step="0.01" className="narrow" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: +e.target.value })} aria-label="Unit price" />
            <button type="button" className="icon-btn" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn small ghost" onClick={() => setLines([...lines, { description: '', qty: 1, unitPrice: 0 }])}>
          + Line
        </button>
        <div className="actions spread">
          <strong>Subtotal {fmtMoney(total, db.settings.currency)}</strong>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary">Create invoice</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ProductModal({ initial, onClose }: { initial?: Product; onClose: () => void }) {
  const { update } = useStore();
  const [p, setP] = useState<Product>(initial ?? { id: uid(), name: '', sessions: 10, price: 0, validDays: 90, description: '' });
  return (
    <Modal title={initial ? 'Edit package' : 'New package'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = update((d) => {
            const i = d.products.findIndex((x) => x.id === p.id);
            if (i >= 0) d.products[i] = p;
            else d.products.push(p);
          }, 'Package saved');
          if (ok) onClose();
        }}
      >
        <Field label="Name">
          <input required autoFocus value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        <div className="row">
          <Field label="Sessions">
            <input type="number" min={1} value={p.sessions} onChange={(e) => setP({ ...p, sessions: +e.target.value })} />
          </Field>
          <Field label="Price">
            <input type="number" min={0} step="0.01" value={p.price} onChange={(e) => setP({ ...p, price: +e.target.value })} />
          </Field>
          <Field label="Valid for (days)">
            <input type="number" min={1} value={p.validDays} onChange={(e) => setP({ ...p, validDays: +e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={2} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
        </Field>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Billing() {
  const { db, update } = useStore();
  const [tab, setTab] = useState<Tab>('invoices');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');
  const [view, setView] = useState<ID | null>(null);
  const [newInvoice, setNewInvoice] = useState(false);
  const [selling, setSelling] = useState<ID | null>(null);
  const [sellPick, setSellPick] = useState('');
  const [editProduct, setEditProduct] = useState<Product | 'new' | null>(null);
  const now = new Date();
  const cur = db.settings.currency;

  const invoices = db.invoices
    .filter((i) => filter === 'all' || (filter === 'paid' ? i.status === 'paid' : i.status === 'sent'))
    .sort((a, b) => b.number - a.number);

  const months = Array.from({ length: 6 }, (_, i) => {
    const from = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - 4 + i, 1);
    const sessions = db.appointments.filter((a) => a.status === 'completed' && new Date(a.start) >= from && new Date(a.start) < to).length;
    return { label: from.toLocaleDateString(undefined, { month: 'short' }), revenue: revenueBetween(db, from, to), sessions };
  });
  const maxRev = Math.max(1, ...months.map((m) => m.revenue));
  const yearStart = new Date(now.getFullYear(), 0, 1);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Billing</h1>
        <div className="actions">
          <select
            value={sellPick}
            onChange={(e) => {
              setSelling(e.target.value || null);
              setSellPick('');
            }}
            aria-label="Sell package to client"
          >
            <option value="">Sell package to…</option>
            {db.clients
              .filter((c) => c.status !== 'inactive')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
          </select>
          <button className="btn primary" onClick={() => setNewInvoice(true)}>
            + Invoice
          </button>
        </div>
      </header>

      <div className="stats">
        <Stat label="Outstanding" value={fmtMoney(outstanding(db), cur)} sub={`${db.invoices.filter((i) => i.status === 'sent').length} unpaid invoices`} />
        <Stat label="Overdue" value={db.invoices.filter((i) => isOverdue(i, now)).length} sub="invoices past due date" />
        <Stat label="This month" value={fmtMoney(months[5].revenue, cur)} sub="paid revenue" />
        <Stat label="Year to date" value={fmtMoney(revenueBetween(db, yearStart, now), cur)} sub="paid revenue" />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          ['invoices', 'Invoices'],
          ['packages', 'Packages & pricing'],
          ['reports', 'Reports'],
        ]}
      />

      {tab === 'invoices' && (
        <>
          <div className="toolbar">
            <div className="seg">
              {(['unpaid', 'paid', 'all'] as const).map((f) => (
                <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {invoices.length === 0 ? (
            <Empty>No invoices here.</Empty>
          ) : (
            <div className="card table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Client</th>
                    <th>Items</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="clickable" onClick={() => setView(i.id)}>
                      <td>{i.number}</td>
                      <td>
                        <Link to={`/clients/${i.clientId}`} onClick={(e) => e.stopPropagation()}>
                          {clientName(db, i.clientId)}
                        </Link>
                      </td>
                      <td className="small">{i.lines.map((l) => l.description).join(', ')}</td>
                      <td className="small">{fmtDate(i.issuedAt)}</td>
                      <td className="small">{fmtDate(i.dueAt)}</td>
                      <td className="num">{fmtMoney(invoiceTotals(i, db.settings.taxRatePct).total, cur)}</td>
                      <td>
                        <Badge tone={i.status === 'paid' ? 'good' : isOverdue(i, now) ? 'bad' : i.status === 'void' ? 'neutral' : 'warn'}>{isOverdue(i, now) ? 'overdue' : i.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'packages' && (
        <>
          <div className="toolbar">
            <button className="btn ghost" onClick={() => setEditProduct('new')}>
              + New package
            </button>
          </div>
          {db.products.length === 0 ? (
            <Empty>No packages yet.</Empty>
          ) : (
            <div className="cards">
              {db.products.map((p) => {
                const sold = db.clientPackages.filter((x) => x.productId === p.id).length;
                return (
                  <div key={p.id} className="card tile">
                    <h3>{p.name}</h3>
                    <div className="price">{fmtMoney(p.price, cur)}</div>
                    <p className="muted small">
                      {p.sessions} session{p.sessions === 1 ? '' : 's'} · {fmtMoney(p.price / p.sessions, cur)} each · valid {p.validDays} days
                    </p>
                    <p className="small clamp">{p.description}</p>
                    <div className="tile-foot">
                      <Badge tone="brand">{sold} sold</Badge>
                      <span className="grow" />
                      <button className="btn small ghost" onClick={() => setEditProduct(p)}>
                        Edit
                      </button>
                      <button
                        className="btn small ghost danger"
                        onClick={() => confirm(`Delete ${p.name}? Clients who bought it keep their credits.`) && update((d) => void (d.products = d.products.filter((x) => x.id !== p.id)), 'Package deleted')}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'reports' && (
        <section className="card">
          <h2>Last 6 months</h2>
          <div className="bars" role="img" aria-label="Monthly revenue">
            {months.map((m) => (
              <div key={m.label} className="bar-col">
                <div className="bar-val">{fmtMoney(m.revenue, cur)}</div>
                <div className="bar-v" style={{ height: `${(m.revenue / maxRev) * 160}px` }} />
                <div className="bar-label">{m.label}</div>
                <div className="muted small">{m.sessions} sessions</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {view && <InvoiceView id={view} onClose={() => setView(null)} />}
      {newInvoice && <NewInvoiceModal onClose={() => setNewInvoice(false)} />}
      {selling && <SellPackageModal clientId={selling} onClose={() => setSelling(null)} />}
      {editProduct && <ProductModal initial={editProduct === 'new' ? undefined : editProduct} onClose={() => setEditProduct(null)} />}
    </div>
  );
}
