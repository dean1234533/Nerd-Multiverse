import { collection, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { firestore, secretToken } from './firebase';
import type { PortalLinkDoc } from './firestoreModel';

/**
 * The client's current portal link token, creating one if needed. With
 * `regenerate`, existing links are revoked and a fresh one is issued.
 */
export async function portalLinkToken(workspaceId: string, clientId: string, regenerate = false): Promise<string> {
  const existing = await getDocs(
    query(collection(firestore, 'portalLinks'), where('workspaceId', '==', workspaceId), where('clientId', '==', clientId), where('revoked', '==', false)),
  );
  if (existing.docs.length && !regenerate) return existing.docs[0].id;
  if (existing.docs.length) {
    const batch = writeBatch(firestore);
    existing.docs.forEach((d) => batch.update(d.ref, { revoked: true }));
    await batch.commit();
  }
  const token = secretToken();
  await setDoc(doc(firestore, 'portalLinks', token), { workspaceId, clientId, createdAt: serverTimestamp(), revoked: false } satisfies PortalLinkDoc);
  return token;
}
