import { compile, NetworkProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary } from "../helpers/utils";
import { Address, toNano } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';

export async function run(provider: NetworkProvider) {
    const jettonWalletCodeRaw = await compile('JettonWallet');
    const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw);

    const jettonWallet = provider.open(JettonWallet.createFromConfig({
        ownerAddress: Address.parse(''),
        jettonMasterAddress: Address.parse('')
    }, jettonWalletCode));

    await jettonWallet.sendTransfer(
        provider.sender(),
        toNano('0.3'),
        BigInt(150 * 1e6), // jetton amount
        Address.parse(''), // destination address
        Address.parse(''), // response destination address
        null, // custom payload
        toNano('0.3'), // forward ton amount
        null // forward payload
    );
}