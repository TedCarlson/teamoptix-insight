import MetricsUploadClient from '../../metrics/upload/uploadClient'

export default function AdminUploadsPage() {
    return (
        <main style={{ padding: 40, maxWidth: 1100, margin: '0 auto' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 18,
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>KPI Upload</h1>
                    <p style={{ marginTop: 6, opacity: 0.85 }}>
                        Drop KPI files here for upload.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <a
                        href="/admin"
                        style={{
                            display: 'inline-block',
                            padding: '10px 14px',
                            borderRadius: 12,
                            border: '1px solid currentColor',
                            textDecoration: 'none',
                            fontWeight: 800,
                            opacity: 0.92,
                        }}
                    >
                        ← Back to Admin
                    </a>

                    <a
                        href="/smart"
                        style={{
                            display: 'inline-block',
                            padding: '10px 14px',
                            borderRadius: 12,
                            border: '1px solid currentColor',
                            textDecoration: 'none',
                            fontWeight: 800,
                            opacity: 0.92,
                        }}
                    >
                        View SMART →
                    </a>
                </div>
            </div>

            <MetricsUploadClient />
        </main>
    )
}
