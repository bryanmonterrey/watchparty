export const IDL = {
    version: '0.1.0',
    name: 'counter',
    address: '11111111111111111111111111111111',
    metadata: {
        name: 'counter',
        version: '0.1.0',
        spec: '0.1.0',
        description: 'Counter program',
    },
    instructions: [
        {
            name: 'initialize',
            discriminator: [175, 175, 109, 31, 13, 152, 155, 237],
            accounts: [
                { name: 'counter', isMut: true, isSigner: true },
                { name: 'payer', isMut: true, isSigner: true },
                { name: 'systemProgram', isMut: false, isSigner: false },
            ],
            args: [],
        },
        {
            name: 'increment',
            discriminator: [11, 18, 104, 9, 104, 174, 59, 33],
            accounts: [
                { name: 'counter', isMut: true, isSigner: false },
            ],
            args: [],
        },
        {
            name: 'decrement',
            discriminator: [106, 227, 168, 59, 248, 27, 150, 101],
            accounts: [
                { name: 'counter', isMut: true, isSigner: false },
            ],
            args: [],
        },
        {
            name: 'set',
            discriminator: [198, 51, 53, 241, 116, 29, 126, 194],
            accounts: [
                { name: 'counter', isMut: true, isSigner: false },
            ],
            args: [
                { name: 'value', type: 'u8' },
            ],
        },
        {
            name: 'close',
            discriminator: [98, 165, 201, 177, 108, 65, 206, 96],
            accounts: [
                { name: 'counter', isMut: true, isSigner: false },
                { name: 'payer', isMut: true, isSigner: true },
            ],
            args: [],
        },
    ],
    accounts: [
        {
            name: 'counter',
            discriminator: [224, 175, 173, 76, 237, 56, 46, 210],
            type: {
                kind: 'struct',
                fields: [
                    { name: 'count', type: 'u8' },
                ],
            },
        },
    ],
} as const
