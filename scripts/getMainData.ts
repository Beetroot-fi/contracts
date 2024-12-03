import { Address } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { Main } from '../wrappers/Main';

export async function run(provider: NetworkProvider) {
    const main = provider.open(Main.createFromAddress(Address.parse('')));

    console.log(await main.getData());
}
