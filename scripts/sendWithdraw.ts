import { toNano, Address } from '@ton/core';
import { User } from '../wrappers/User';
import { compile, NetworkProvider } from '@ton/blueprint';
import { jettonWalletCodeFromLibrary } from '../helpers/utils';

export async function run(provider: NetworkProvider) {
    const jettonWalletCodeRaw = await compile('JettonWallet');
    const jettonWalletCode = jettonWalletCodeFromLibrary(jettonWalletCodeRaw)

    const user = provider.open(User.createFromConfig({
        depositTimestamp: BigInt(0),
        unlockTimestamp: BigInt(0),
        adminAddress: Address.parse(''),
        balance: BigInt(0),
        mainScAddress: Address.parse(''),
        rootMasterAddress: Address.parse(''),
        jettonWalletCode: jettonWalletCode,
    }, await compile('User')));

    await user.sendWithdraw(provider.sender(), toNano('0.2'), 0n);
}
