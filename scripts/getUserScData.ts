import { Address } from '@ton/core';
import { User } from '../wrappers/User';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const user = provider.open(User.createFromAddress(Address.parse('')));

    console.log(await user.getUserData());
}
