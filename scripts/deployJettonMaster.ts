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

    await jettonMaster.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(jettonMaster.address);

    // run methods on `jettonMaster`
}
