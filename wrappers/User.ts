import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type UserConfig = {
    depositTimestamp: bigint,
    unlockTimestamp: bigint,
    adminAddress: Address,
    balance: bigint,
    mainScAddress: Address,
    rootMasterAddress: Address,
    jettonWalletCode: Cell,
};

export function userConfigToCell(config: UserConfig): Cell {
    return beginCell()
        .storeUint(config.depositTimestamp, 32)
        .storeUint(config.unlockTimestamp, 32)
        .storeAddress(config.adminAddress)
        .storeUint(config.balance, 64)
        .storeAddress(config.mainScAddress)
        .storeAddress(config.rootMasterAddress)
        .storeRef(config.jettonWalletCode)
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

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        queryId: bigint,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(555, 32)
                .storeUint(queryId, 64)
                .endCell(),
        });
    }
}
