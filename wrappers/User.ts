import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type UserConfig = {
    adminAddress: Address,
    mainScAddress: Address,
    rootMasterAddress: Address,
    jettonWalletCode: Cell,
};

export function userConfigToCell(config: UserConfig): Cell {
    return beginCell()
        .storeUint(0n, 32)
        .storeAddress(config.adminAddress)
        .storeAddress(config.mainScAddress)
        .storeAddress(config.rootMasterAddress)
        .storeRef(config.jettonWalletCode)
        .storeCoins(0)
        .storeCoins(0)
        .storeCoins(0)
        .storeCoins(0)
        .endCell();
}

export class User implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(address: Address) {
        return new User(address);
    }

    static createFromConfig(config: UserConfig, code: Cell, workchain = 0) {
        const data = userConfigToCell(config);
        const init = { code, data };
        return new User(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getUserData(provider: ContractProvider) {
        const result = (await provider.get('get_user_data', [])).stack;

        return {
            depositTimestamp: result.readBigNumber(),
            adminAddress: result.readAddress(),
            mainScAddress: result.readAddress(),
            rootMasterAddress: result.readAddress(),
            jettonWalletCode: result.readCell(),
            usdtSlpAmount: result.readBigNumber(),
            usdtTlpAmount: result.readBigNumber(),
            totalDepositAmount: result.readBigNumber(),
            rootAmount: result.readBigNumber(),
        };
    }
}
