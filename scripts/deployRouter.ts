import { toNano, Address } from '@ton/core';
import { Router } from '../wrappers/Router';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const router = provider.open(Router.createFromConfig({
        mainScAddress: Address.parse(''),
        usdtJettonMasterAddress: Address.parse(''),
        tradoorMasterAddress: Address.parse(''),
        evaaMasterAddress: Address.parse(''),
        stormVaultAddress: Address.parse(''),
        usdtTlpMasterAddress: Address.parse(''),
        usdtSlpMasterAddress: Address.parse(''),
        jettonWalletCode: await compile('JettonWallet'),
        jettonWalletGovernedCode: await compile('JettonWalletGoverned'),
    }, await compile('Router')));

    await router.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(router.address);

    // run methods on `tradoorRouter`
}
