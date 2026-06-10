import { NextRequest, NextResponse } from 'next/server';
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const apiKey = process.env.HELIUS_API_KEY;
        if (!apiKey) {
            console.error('HELIUS_API_KEY is not set');
            return NextResponse.json(
                { error: 'Server configuration error: missing Helium API key' },
                { status: 500 }
            );
        }

        const response = await fetch(
            `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            }
        );

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('RPC proxy error:', error);
        return NextResponse.json({ error: 'RPC request failed' }, { status: 500 });
    }
}
