import { Address, beginCell, Cell, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Main } from '../wrappers/Main';
import { jettonWalletCodeFromLibrary } from '../helpers/utils';

export async function run(provider: NetworkProvider) {
    const main = provider.open(Main.createFromAddress(Address.parse('')));

    await main.sendUpdateRootPrice(
        provider.sender(),
        toNano('0.005'),
        0n,
        100n, // new root price
    );
}
