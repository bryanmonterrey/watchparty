import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// No `runtime` export: Next 16.3 deprecated the edge runtime (build-time warning
// + @deprecated hint), and the Node.js runtime is the default, so removing the
// line IS the migration. Nothing here is edge-specific — `next/og` renders the
// same on both, and on Cloudflare every route runs in workerd regardless.

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const text = searchParams.get('text') || 'Just another amazing post on Watchparty!';
        const name = searchParams.get('name') || 'Creator';
        const username = searchParams.get('username') || '@creator';
        const avatar = searchParams.get('avatar') || '';

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#000000',
                        color: 'white',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: '#ffffff',
                            color: '#000000',
                            width: '800px',
                            minHeight: '400px',
                            borderRadius: '24px',
                            padding: '48px',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* Header: Avatar, Name, Handle */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
                            {avatar ? (
                                <img
                                    src={avatar}
                                    style={{
                                        width: '80px',
                                        height: '80px',
                                        borderRadius: '40px',
                                        objectFit: 'cover',
                                        marginRight: '24px'
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: '80px',
                                        height: '80px',
                                        borderRadius: '40px',
                                        backgroundColor: '#e5e7eb',
                                        marginRight: '24px'
                                    }}
                                />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#09090b', marginBottom: '4px' }}>
                                    {name}
                                </span>
                                <span style={{ fontSize: '24px', color: '#71717a' }}>
                                    {username.startsWith('@') ? username : `@${username}`}
                                </span>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{ display: 'flex', fontSize: '36px', lineHeight: 1.4, color: '#09090b' }}>
                            {text}
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            }
        );
    } catch (e: any) {
        return new Response(`Failed to generate image`, { status: 500 });
    }
}
