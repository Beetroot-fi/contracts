import { toNano, Address } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { JettonWalletGoverned } from '../wrappers/JettonWalletGoverned';
import { jettonWalletCodeFromLibrary } from '../helpers/utils';

export async function run(provider: NetworkProvider) {
    const jettonWalletGovernedCodeRaw = await compile('JettonWalletGoverned');
    const jettonWalletGovernedCode = jettonWalletCodeFromLibrary(jettonWalletGovernedCodeRaw);

    const jettonWallet = provider.open(JettonWalletGoverned.createFromConfig({
        ownerAddress: Address.parse('0QDYQBKNXwHVOD6Ucw7zXLrbQi9d7VngoFfG3xIYOG_0-tQS'),
        jettonMasterAddress: Address.parse('kQBxPxYRD9IOrnIEQysG7D9enWnxg8AGx-wUdcA55mxaKdTK'),
    }, jettonWalletGovernedCode));

    await jettonWallet.sendTransfer(
        provider.sender(),
        toNano('1'),
        BigInt(200 * 1e6), // jetton amount
        Address.parse(''), // destination
        Address.parse(''), // response destination
        null, // custom payload
        toNano('0.3'), // forward ton amount
        null, // forward payload
    );
}
