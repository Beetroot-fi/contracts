import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: ['contracts/mocks/stablecoin/jetton_wallet_governed.fc'],
};
