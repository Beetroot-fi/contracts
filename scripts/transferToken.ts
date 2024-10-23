import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { jettonWalletCodeFromLibrary } from '../helpers/utils';

export async function run(provider: NetworkProvider) {
    const jettonWalletCodeRaw = await compile('JettonWallet');
    const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw);

    const jettonWallet = provider.open(JettonWallet.createFromConfig({
        ownerAddress: Address.parse(''),
        jettonMasterAddress: Address.parse(''),
    }, jettonWalletCode));

    await jettonWallet.sendTransfer(
        provider.sender(),
        toNano('1'),
        BigInt(150 * 1e6), // jetton amount
        Address.parse(''), // destination
        Address.parse(''), // response destination
        null, // custom payload
        toNano('0.3'), // forward ton amount
        null, // forward payload
    );
}
