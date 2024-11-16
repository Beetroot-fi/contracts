import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type RouterConfig = {
    mainScAddress: Address,
    usdtJettonMasterAddress: Address,
    tradoorMasterAddress: Address,
    evaaMasterAddress: Address,
    stormVaultAddress: Address,
    usdtTlpMasterAddress: Address,
    usdtSlpMasterAddress: Address,
    jettonWalletCode: Cell,
    jettonWalletGovernedCode: Cell,
};

export function tradoorRouterConfigToCell(config: RouterConfig): Cell {
    return beginCell()
        .storeAddress(config.mainScAddress)
        .storeRef(beginCell()
            .storeAddress(config.tradoorMasterAddress)
            .storeAddress(config.evaaMasterAddress)
            .storeAddress(config.stormVaultAddress)
            .endCell()
        )
        .storeRef(beginCell()
            .storeAddress(config.usdtJettonMasterAddress)
            .storeAddress(config.usdtTlpMasterAddress)
            .storeAddress(config.usdtSlpMasterAddress)
            .endCell()
        )
        .storeRef(config.jettonWalletCode)
        .storeRef(config.jettonWalletGovernedCode)
        .storeCoins(0)
        .storeCoins(0)
        .storeCoins(0)
        .storeUint(0, 2)
        .endCell();
}

export class Router implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(address: Address) {
        return new Router(address);
    }

    static createFromConfig(config: RouterConfig, code: Cell, workchain = 0) {
        const data = tradoorRouterConfigToCell(config);
        const init = { code, data };
        return new Router(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
