// Floating "Chat on WhatsApp" support button, shown on every screen
// (sign-in, the trainer app and the client portal).

// UK number 07752 300937 in international format, as wa.me requires.
export const SUPPORT_WHATSAPP = '447752300937';
const SUPPORT_MESSAGE = 'Hi, I need some help with RepMinder.';

export const supportWhatsAppUrl = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;

export default function WhatsAppSupport() {
  return (
    <a
      className="wa-support"
      href={supportWhatsAppUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp support: 07752 300937"
      title="WhatsApp support: 07752 300937"
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.5 9.5 0 0 1-4.84-1.33l-.35-.21-3.6.94.96-3.5-.23-.36a9.46 9.46 0 0 1-1.45-5.05c0-5.24 4.27-9.5 9.52-9.5a9.45 9.45 0 0 1 9.5 9.51c0 5.24-4.27 9.5-9.5 9.5zm8.08-17.59A11.36 11.36 0 0 0 12.05.5C5.75.5.63 5.62.63 11.92c0 2.01.53 3.98 1.53 5.71L.53 23.5l6.01-1.58a11.4 11.4 0 0 0 5.5 1.4h.01c6.3 0 11.42-5.12 11.42-11.42 0-3.05-1.19-5.92-3.34-8.08z" />
      </svg>
      <span className="wa-support-label">Support</span>
    </a>
  );
}
