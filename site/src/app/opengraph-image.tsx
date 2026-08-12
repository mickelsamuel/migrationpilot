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

// The Threshold mark, same three strokes as app/icon.svg. Satori rasterises an
// `img` data URI reliably, where an inline `svg` element is at the mercy of its
// SVG subset. No dark tile here: the card is already dark, and the bare strokes
// carry further at share-card scale than a near-black square on a near-black
// background would.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 32 32">
<g fill="none" stroke="#7C9CF5" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
<path d="M9.75 10 15.75 16 9.75 22"/><path d="M22.25 6v7.5"/><path d="M22.25 18.5V26"/>
</g></svg>`;

const MARK_DATA_URI = `data:image/svg+xml;base64,${btoa(MARK_SVG)}`;

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
          <img src={MARK_DATA_URI} width={72} height={72} alt="" />
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
