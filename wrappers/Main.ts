import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MainConfig = {
    usdtJettonMasterAddress: Address,
    rootMasterAddress: Address,
    userScCode: Cell,
    adminAddress: Address,
    jettonWalletGovernedCode: Cell,
    jettonWalletCode: Cell,
    rootPrice: bigint,
    tradoorMasterAddress: Address,
    stormVaultAddress: Address,
    usdtSlpJettonWallet: Address,
    usdtTlpJettonWallet: Address,
};

export function mainConfigToCell(config: MainConfig): Cell {
    return beginCell()
        .storeAddress(config.usdtJettonMasterAddress)
        .storeAddress(config.rootMasterAddress)
        .storeRef(config.userScCode)
        .storeAddress(config.adminAddress)
        .storeRef(config.jettonWalletGovernedCode)
        .storeRef(config.jettonWalletCode)
        .storeRef(
            beginCell()
                .storeAddress(config.tradoorMasterAddress)
                .storeAddress(config.stormVaultAddress)
                .storeRef(
                    beginCell()
                        .storeAddress(config.usdtSlpJettonWallet)
                        .storeAddress(config.usdtTlpJettonWallet)
                        .endCell()
                )
                .endCell()
        )
        .storeUint(config.rootPrice, 64)
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

    async sendUpdateRootPrice(provider: ContractProvider, via: Sender, value: bigint, queryId: bigint, newRootPrice: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(344, 32).storeUint(queryId, 64).storeUint(newRootPrice, 64).endCell(),
        });
    }

    async sendUpgradeContract(provider: ContractProvider, via: Sender, value: bigint, queryId: bigint, newCode: Cell, newData: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(999, 32)
                .storeUint(queryId, 64)
                .storeRef(newData)
                .storeRef(newCode)
                .endCell()
        })
    }

    async sendMintUserInternal(provider: ContractProvider, via: Sender, value: bigint, opts: {
        queryId: bigint,
        totalDepositAmount: bigint,
        usdtSlpAmount: bigint,
        usdtTlpAmount: bigint,
        rootAmount: bigint,
        adminAddress: Address
    }) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(558, 32)
                .storeUint(opts.queryId, 64)
                .storeCoins(opts.usdtTlpAmount)
                .storeCoins(opts.usdtSlpAmount)
                .storeCoins(opts.totalDepositAmount)
                .storeAddress(opts.adminAddress)
                .endCell(),
        });
    }

    async sendSuccessfulWithdraw(provdier: ContractProvider, via: Sender, value: bigint, opts: {
        queryId: bigint,
        usdtAmount: bigint,
        adminAddress: Address
    }) {
        await provdier.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(489, 32)
                .storeUint(0, 64)
                .storeCoins(opts.usdtAmount)
                .storeAddress(opts.adminAddress)
                .endCell(),
        });
    }

    async sendDeposit(provider: ContractProvider, via: Sender, value: bigint, opts: {
        queryId: bigint,
        totalDepositAmount: bigint,
        usdtSlpAmount: bigint,
        usdtTlpAmount: bigint,
        rootAmount: bigint,
    }) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(20, 32)
                .storeUint(opts.queryId, 64)
                .storeCoins(opts.totalDepositAmount)
                .storeCoins(opts.usdtSlpAmount)
                .storeCoins(opts.usdtTlpAmount)
                .storeCoins(opts.rootAmount)
                .endCell()
        })
    }

    async sendWithdrawInternal(provider: ContractProvider, via: Sender, value: bigint, opts: {
        queryId: bigint,
        jettonAmount: bigint
    }) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(556, 32)
                .storeUint(opts.queryId, 64)
                .storeCoins(opts.jettonAmount)
                .endCell()
        })
    }

    async getUserScAddress(provider: ContractProvider, ownerAddress: Address): Promise<Address> {
        const result = (await provider.get('get_user_sc_address', [
            {
                type: "slice",
                cell: beginCell().storeAddress(ownerAddress).endCell()
            }
        ])).stack

        return result.readAddress();
    }

    async getData(provider: ContractProvider) {
        const result = (await provider.get('get_main_data', [])).stack

        return {
            usdtJettonMasterAddress: result.readAddress(),
            rootMasterAddress: result.readAddress(),
            userScCode: result.readCell(),
            adminAddress: result.readAddress(),
            usdtJettonWalletCode: result.readCell(),
            jettonWalletCode: result.readCell(),
            rootPrice: result.readBigNumber(),
            tradoorMasterAddress: result.readAddress(),
            stormVaultAddress: result.readAddress(),
            usdtSlpJettonWallet: result.readAddress(),
            usdtTlpJettonWallet: result.readAddress(),
        }
    }
}
