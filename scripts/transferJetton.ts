import { toNano, Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';


export async function run(provider: NetworkProvider) {
    const jettonWallet = provider.open(JettonWallet.createFromAddress(Address.parse('')));

    await jettonWallet.sendTransfer(
        provider.sender(),
        {
            value: toNano('0.9'),
            toAddress: Address.parse(''),
            queryId: 0,
            fwdAmount: toNano('0.85'),
            jettonAmount: toNano('0.01'),
            forwardPayload: null
        }
    );
}
