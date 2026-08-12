import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'MigrationPilot — Know what your migration will do to production';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Satori resolves no system fonts, so the card has to carry its own or every
// share goes out with substituted metrics and visibly uneven word spacing.
// Geist, SIL Open Font License 1.1 — see Geist-LICENSE.txt alongside.
const geist = (weight: 'Regular' | 'Bold') =>
  fetch(new URL(`./Geist-${weight}.ttf`, import.meta.url)).then((res) => res.arrayBuffer());

export default async function OGImage() {
  const [regular, bold] = await Promise.all([geist('Regular'), geist('Bold')]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          fontFamily: 'Geist',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              fontWeight: 'bold',
              color: 'white',
            }}
          >
            MP
          </div>
          <span style={{ fontSize: '42px', fontWeight: 'bold', color: 'white' }}>
            MigrationPilot
          </span>
        </div>
        <div
          style={{
            // Satori lays a div out as flex and only supports flex/none, so a
            // line that wraps is spaced as flex items and the gaps come out
            // uneven. Breaking the copy explicitly keeps each line unwrapped.
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontSize: '28px',
            color: '#94a3b8',
            lineHeight: 1.4,
          }}
        >
          <div>Know exactly what your PostgreSQL migration</div>
          <div>will do to production</div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '24px',
            marginTop: '40px',
          }}
        >
          <div
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#60a5fa',
              fontSize: '20px',
            }}
          >
            112 Safety Rules
          </div>
          <div
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#60a5fa',
              fontSize: '20px',
            }}
          >
            Auto-fix
          </div>
          <div
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#60a5fa',
              fontSize: '20px',
            }}
          >
            Risk Scoring
          </div>
          <div
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              color: '#60a5fa',
              fontSize: '20px',
            }}
          >
            GitHub Action
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            color: '#475569',
            fontSize: '18px',
          }}
        >
          migrationpilot.dev
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
}
