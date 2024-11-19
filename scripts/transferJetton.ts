import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';


export async function run(provider: NetworkProvider) {
    const jettonWalletCode = await compile('JettonWallet');

    const jettonWallet = provider.open(JettonWallet.createFromConfig({
        ownerAddress: Address.parse(''),
        jettonMasterAddress: Address.parse(''),
        jettonWalletCode: jettonWalletCode,
    }, jettonWalletCode));

    await jettonWallet.sendTransfer(
        provider.sender(),
        {
            value: toNano('1'),
            toAddress: Address.parse(''),
            queryId: 0,
            fwdAmount: toNano('0.03'),
            jettonAmount: toNano('2'),
            forwardPayload: null,
        }
    );
}
