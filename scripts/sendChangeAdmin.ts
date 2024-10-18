import { beginCell, toNano, Address } from '@ton/core';
import { JettonMaster } from '../wrappers/JettonMaster';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const jettonWalletCode = await compile('JettonWallet');

    const jettonMaster = provider.open(JettonMaster.createFromConfig({
        totalSupply: toNano(''),
        adminAddress: Address.parse(''),
        content: beginCell()
            .storeUint(0x01, 8)
            .storeStringTail('')
            .endCell(),
        jettonWalletCode: jettonWalletCode,
    }, await compile('JettonMaster')));

    await jettonMaster.sendChangeAdmin(
        provider.sender(),
        toNano('0.03'),
        {
            queryId: 0n,
            newAdminAddress: Address.parse(''),
        }
    );
}
