import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MainConfig = {
    usdtJettonMasterAddress: Address,
    usdtJettonWalletCode: Cell,
    rootMasterAddress: Address,
    userScCode: Cell,
    adminAddress: Address,
    jettonWalletCode: Cell,
};

export function mainConfigToCell(config: MainConfig): Cell {
    return beginCell()
        .storeAddress(config.usdtJettonMasterAddress)
        .storeRef(config.usdtJettonWalletCode)
        .storeAddress(config.rootMasterAddress)
        .storeRef(config.userScCode)
        .storeAddress(config.adminAddress)
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export class Main implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(address: Address) {
        return new Main(address);
    }

    static createFromConfig(config: MainConfig, code: Cell, workchain = 0) {
        const data = mainConfigToCell(config);
        const init = { code, data };
        return new Main(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
