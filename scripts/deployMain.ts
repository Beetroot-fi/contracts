import { toNano, Address } from '@ton/core';
import { Main } from '../wrappers/Main';
import { compile, NetworkProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary } from '../helpers/utils';

export async function run(provider: NetworkProvider) {
    const userScCode = await compile('User');

    const jettonWalletCodeRaw = await compile('JettonWalletGoverned');
    const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw)

    const main = provider.open(Main.createFromConfig({
        usdtJettonMasterAddress: Address.parse(''),
        usdtJettonWalletCode: jettonWalletCode,
        rootMasterAddress: Address.parse(''),
        userScCode: userScCode,
        adminAddress: Address.parse('')
    }, await compile('Main')));

    await main.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(main.address);

    // run methods on `main`
}
