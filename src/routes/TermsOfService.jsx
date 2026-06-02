export default function TermsOfService() {
  return (
    <div style={{ minHeight: '100dvh', background: '#f5f0ff' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '60px 24px 80px' }}>

        <div style={{ marginBottom: 48 }}>
          <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'rgba(60,32,112,0.6)', textDecoration: 'none', fontSize: 14, marginBottom: 32 }}>
            <img src="/finalvault_logo.svg" alt="FinalVault" width="20" height="20" />
            FinalVault
          </a>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1a0a3c', marginBottom: 8 }}>Terms of Service</h1>
          <p style={{ color: 'rgba(60,32,112,0.55)', fontSize: 14 }}>Last updated: June 1, 2026</p>
        </div>

        <div style={{ color: '#2a1254', fontSize: 15, lineHeight: 1.8 }}>
          <style>{`ul { padding-left: 24px; margin: 8px 0; } li { margin-bottom: 6px; list-style-type: disc; }`}</style>

          <Section title="Agreement to Terms">
            By accessing or using FinalVault ("the Service"), operated by Docker Cap Photography ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
          </Section>

          <Section title="Description of Service">
            FinalVault is a client gallery delivery platform that allows photographers to upload, organize, and share photo galleries with their clients. The Service includes gallery management, watermarking, client access controls, email delivery, and related features.
          </Section>

          <Section title="Accounts">
            <ul>
              <li>You must provide accurate and complete information when creating an account.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must be at least 18 years old to create an account.</li>
              <li>You may not create accounts on behalf of others without their explicit permission.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </Section>

          <Section title="Acceptable Use">
            You agree not to use FinalVault to:
            <ul>
              <li>Upload, share, or distribute illegal content, including but not limited to content that infringes intellectual property rights or depicts illegal activity</li>
              <li>Upload, share, or distribute sexually explicit content involving minors</li>
              <li>Harass, threaten, or harm other users or clients</li>
              <li>Attempt to gain unauthorized access to the Service or other users' data</li>
              <li>Use the Service to send unsolicited commercial email (spam)</li>
              <li>Attempt to circumvent rate limits, security measures, or access controls</li>
              <li>Use automated tools to scrape or abuse the Service</li>
            </ul>
          </Section>

          <Section title="Your Content">
            You retain ownership of all images and content you upload to FinalVault. By uploading content, you grant us a limited license to store, process, and display your content solely for the purpose of providing the Service to you and your clients.

            You are solely responsible for ensuring you have the rights to upload and share all content you add to FinalVault, including model releases and intellectual property rights where applicable.

            We do not claim ownership of your content and will not use it for any purpose beyond operating the Service.
          </Section>

          <Section title="Client Data">
            When you share a gallery with a client, you are responsible for:
            <ul>
              <li>Having appropriate permission to collect and process your client's email address</li>
              <li>Informing your clients that their activity (views, favorites, downloads, comments) is logged and visible to you</li>
              <li>Complying with applicable privacy laws in your jurisdiction regarding client data</li>
            </ul>
          </Section>

          <Section title="Storage and Usage Limits">
            Your account is subject to storage limits based on your assigned storage tier. The default free tier provides 5 GB of storage. Exceeding your storage limit may result in the inability to upload additional content until storage is freed or your tier is upgraded.

            We reserve the right to adjust storage tiers and limits with reasonable notice to affected users.
          </Section>

          <Section title="Paid Plans">
            FinalVault currently offers a free tier. Paid subscription plans may be introduced in the future. When paid plans are available, the following will apply:
            <ul>
              <li>Subscription fees will be charged in advance on a recurring basis</li>
              <li>Refunds will be handled on a case-by-case basis</li>
              <li>We will provide at least 30 days notice before changing pricing for existing subscribers</li>
            </ul>
          </Section>

          <Section title="Service Availability">
            We strive to maintain reliable uptime but do not guarantee uninterrupted access to the Service. We may perform maintenance, updates, or experience outages that temporarily affect availability. We are not liable for any losses resulting from Service unavailability.
          </Section>

          <Section title="Termination">
            You may delete your account at any time. We may suspend or terminate your account if you violate these Terms, with or without notice depending on the severity of the violation. Upon termination, your data will be deleted in accordance with our Privacy Policy.
          </Section>

          <Section title="Disclaimer of Warranties">
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE, SECURE, OR CONTINUOUSLY AVAILABLE.
          </Section>

          <Section title="Limitation of Liability">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, DOCKER CAP PHOTOGRAPHY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRECEDING THE CLAIM.
          </Section>

          <Section title="Governing Law">
            These Terms are governed by the laws of the State of Ohio, United States, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Ohio.
          </Section>

          <Section title="Changes to These Terms">
            We may update these Terms from time to time. We will notify active users of material changes via email at least 14 days before they take effect. Continued use of the Service after changes constitutes acceptance of the updated Terms.
          </Section>

          <Section title="Contact">
            Questions about these Terms? Contact us at:
            <br /><br />
            <strong>Docker Cap Photography</strong><br />
            Ohio, United States<br />
            <a href="mailto:dockercapphotography@gmail.com" style={{ color: '#7c5cbf' }}>dockercapphotography@gmail.com</a>
          </Section>

        </div>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(124,92,191,0.15)', display: 'flex', gap: 24 }}>
          <a href="/privacy" style={{ fontSize: 13, color: 'rgba(60,32,112,0.5)', textDecoration: 'none' }}>Privacy Policy</a>
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
