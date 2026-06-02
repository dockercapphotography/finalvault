export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100dvh', background: '#f5f0ff' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '60px 24px 80px' }}>

        <div style={{ marginBottom: 48 }}>
          <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'rgba(60,32,112,0.6)', textDecoration: 'none', fontSize: 14, marginBottom: 32 }}>
            <img src="/finalvault_logo.svg" alt="FinalVault" width="20" height="20" />
            FinalVault
          </a>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1a0a3c', marginBottom: 8 }}>Privacy Policy</h1>
          <p style={{ color: 'rgba(60,32,112,0.55)', fontSize: 14 }}>Last updated: June 1, 2026</p>
        </div>

        <div style={{ color: '#2a1254', fontSize: 15, lineHeight: 1.8 }}>
          <style>{`ul { padding-left: 24px; margin: 8px 0; } li { margin-bottom: 6px; list-style-type: disc; }`}</style>

          <Section title="Overview">
            FinalVault is a client gallery delivery platform for photographers, operated by Docker Cap Photography ("we," "us," or "our"), based in Ohio, United States. This Privacy Policy explains how we collect, use, and protect information when you use FinalVault at any domain we operate.
          </Section>

          <Section title="Who This Policy Covers">
            This policy applies to two types of users:
            <ul>
              <li><strong>Photographers</strong> — individuals who create accounts, upload images, and manage galleries.</li>
              <li><strong>Clients</strong> — individuals who access galleries shared with them by a photographer. Clients do not create accounts.</li>
            </ul>
          </Section>

          <Section title="Information We Collect">
            <strong>From photographers:</strong>
            <ul>
              <li>Email address and password (used for authentication via Supabase)</li>
              <li>First and last name, display name, and business/studio name</li>
              <li>Profile photo (optional)</li>
              <li>Social media and payment links (optional, displayed in gallery emails)</li>
              <li>Images and files uploaded to galleries</li>
              <li>Gallery settings, watermark configurations, and email templates</li>
              <li>Notification preferences</li>
            </ul>
            <strong>From clients:</strong>
            <ul>
              <li>Email address (entered at the gallery gate to access a shared gallery)</li>
              <li>Favorites and comments left on gallery images</li>
              <li>Gallery access activity (views, downloads, favorites, comments) — logged and visible to the photographer</li>
            </ul>
            <strong>Automatically collected:</strong>
            <ul>
              <li>Error and performance data via Sentry (browser type, page URLs, stack traces)</li>
              <li>IP address (used for rate limiting on upload and download endpoints)</li>
            </ul>
          </Section>

          <Section title="How We Use Your Information">
            <ul>
              <li>To provide and operate the FinalVault service</li>
              <li>To authenticate photographers and manage their accounts</li>
              <li>To deliver gallery access to clients on behalf of photographers</li>
              <li>To send activity digest emails and gallery expiry reminders to photographers</li>
              <li>To send gallery share emails to clients on behalf of photographers</li>
              <li>To monitor application health and fix errors (via Sentry)</li>
              <li>To enforce rate limits and prevent abuse</li>
            </ul>
            We do not sell your data. We do not use your data for advertising.
          </Section>

          <Section title="Image Storage">
            Images uploaded by photographers are stored in Cloudflare R2, a cloud object storage service. Preview images (displayed in galleries) include any watermark applied by the photographer. Original high-resolution files are stored separately and are only accessible to authenticated photographers or clients with explicit download permission granted by the photographer.
          </Section>

          <Section title="Data Sharing">
            We share data only as necessary to operate the service:
            <ul>
              <li><strong>Supabase</strong> — database, authentication, and Edge Functions (United States)</li>
              <li><strong>Cloudflare</strong> — R2 storage, Workers, and Pages (global CDN)</li>
              <li><strong>Resend</strong> — transactional email delivery</li>
              <li><strong>Sentry</strong> — error monitoring and session replay</li>
            </ul>
            We do not share your data with any other third parties.
          </Section>

          <Section title="Client Data and Photographer Responsibility">
            When a photographer shares a gallery with a client, the client's email address and activity data are stored and made visible to that photographer. Photographers are responsible for ensuring they have appropriate permission to collect and display this data to their clients. FinalVault processes this data on behalf of photographers.
          </Section>

          <Section title="Data Retention">
            Photographer account data is retained for as long as the account is active. If you delete your account, your data will be removed from our systems within 30 days, except where retention is required by law. Client email addresses and activity logs are retained as long as the associated gallery exists.
          </Section>

          <Section title="Security">
            We use industry-standard security practices including encrypted connections (HTTPS/TLS), hashed authentication tokens, and row-level security policies in our database to ensure photographers can only access their own data. However, no system is completely secure, and we cannot guarantee absolute security.
          </Section>

          <Section title="Your Rights">
            You have the right to:
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Withdraw consent where processing is based on consent</li>
            </ul>
            To exercise any of these rights, contact us at the email below.
          </Section>

          <Section title="Children's Privacy">
            FinalVault is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us and we will delete it.
          </Section>

          <Section title="Changes to This Policy">
            We may update this Privacy Policy from time to time. We will notify active photographers of material changes via email. Continued use of FinalVault after changes constitutes acceptance of the updated policy.
          </Section>

          <Section title="Contact">
            If you have questions about this Privacy Policy or your data, contact us at:
            <br /><br />
            <strong>Docker Cap Photography</strong><br />
            Ohio, United States<br />
            <a href="mailto:dockercapphotography@gmail.com" style={{ color: '#7c5cbf' }}>dockercapphotography@gmail.com</a>
          </Section>

        </div>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(124,92,191,0.15)', display: 'flex', gap: 24 }}>
          <a href="/terms" style={{ fontSize: 13, color: 'rgba(60,32,112,0.5)', textDecoration: 'none' }}>Terms of Service</a>
          <a href="/login" style={{ fontSize: 13, color: 'rgba(60,32,112,0.5)', textDecoration: 'none' }}>Back to FinalVault</a>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a0a3c', marginBottom: 12 }}>{title}</h2>
      <div style={{ color: 'rgba(30,10,70,0.75)' }}>{children}</div>
    </div>
  )
}
