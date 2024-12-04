import { toNano, Address } from '@ton/core';
import { Main } from '../wrappers/Main';
import { compile, NetworkProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary } from '../helpers/utils';
import { ADMIN_ADDRESS, BEETROOT_JETTON_MINTER_ADDRESS, MAIN_USDT_SLP_JETTON_WALLET, MAIN_USDT_TLP_JETTON_WALLET, STORM_VAULT_ADDRESS, TRADOOR_MASTER_ADDRESS, USDT_JETTON_MINTER_ADDRESS } from '../helpers/conts';

export async function run(provider: NetworkProvider) {
    const userScCode = await compile('User');

    const jettonWalletGovernedCodeRaw = await compile('JettonWalletGoverned');
    const jettonWalletGovernedCode = jettonWalletCodeFromLibrary(jettonWalletGovernedCodeRaw);

    const jettonWalletCode = await compile('JettonWallet');

    const main = provider.open(Main.createFromConfig({
        usdtJettonMasterAddress: USDT_JETTON_MINTER_ADDRESS,
        rootMasterAddress: BEETROOT_JETTON_MINTER_ADDRESS,
        userScCode: userScCode,
        adminAddress: ADMIN_ADDRESS,
        jettonWalletGovernedCode: jettonWalletGovernedCode,
        jettonWalletCode: jettonWalletCode,
        rootPrice: 100n,
        tradoorMasterAddress: TRADOOR_MASTER_ADDRESS,
        stormVaultAddress: STORM_VAULT_ADDRESS,
        usdtSlpJettonWallet: MAIN_USDT_SLP_JETTON_WALLET,
        usdtTlpJettonWallet: MAIN_USDT_TLP_JETTON_WALLET,
    }, await compile('Main')));

    await main.sendDeploy(provider.sender(), toNano('0.002'));

    await provider.waitForDeploy(main.address);
}
