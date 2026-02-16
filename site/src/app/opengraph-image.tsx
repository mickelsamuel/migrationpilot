import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'MigrationPilot — Know what your migration will do to production';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
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
          fontFamily: 'system-ui, -apple-system, sans-serif',
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
            fontSize: '28px',
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: '800px',
            lineHeight: 1.4,
          }}
        >
          Know exactly what your PostgreSQL migration will do to production
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
            48 Safety Rules
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
    { ...size },
  );
}
