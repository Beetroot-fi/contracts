import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MainConfig = {
    usdtJettonMasterAddress: Address,
    rootMasterAddress: Address,
    userScCode: Cell,
    adminAddress: Address,
    jettonWalletGovernedCode: Cell,
    jettonWalletCode: Cell,
    rootPrice: bigint,
    usdtTlpMaster: Address,
    usdtSlpMaster: Address,
    evaaMaster: Address,
    tradoorMaster: Address,
    stormVault: Address,
    recentSender: Address,
    evaaMasterReceive: bigint,
    tradoorMasterReceive: bigint,
    stormVaultReceive: bigint,
    usdtTlpReceive: bigint,
    usdtSlpReceive: bigint,
};

export function mainConfigToCell(config: MainConfig): Cell {
    return beginCell()
        .storeAddress(config.usdtJettonMasterAddress)
        .storeAddress(config.rootMasterAddress)
        .storeRef(config.userScCode)
        .storeAddress(config.adminAddress)
        .storeRef(config.jettonWalletGovernedCode)
        .storeRef(config.jettonWalletCode)
        .storeUint(config.rootPrice, 64)
        .storeAddress(config.usdtTlpMaster)
        .storeAddress(config.usdtSlpMaster)
        .storeAddress(config.evaaMaster)
        .storeAddress(config.tradoorMaster)
        .storeAddress(config.stormVault)
        .storeAddress(config.recentSender)
        .storeUint(config.evaaMasterReceive, 64)
        .storeUint(config.tradoorMasterReceive, 64)
        .storeUint(config.stormVaultReceive, 64)
        .storeUint(config.usdtTlpReceive, 64)
        .storeUint(config.usdtSlpReceive, 64)
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
            usdtTlpMaster: result.readAddress(),
            usdtSlpMaster: result.readAddress(),
            evaaMaster: result.readAddress(),
            tradoorMaster: result.readAddress(),
            stormVault: result.readAddress(),
            recentSender: result.readAddress(),
            evaaMasterReceive: result.readBigNumber(),
            tradoorMasterReceive: result.readBigNumber(),
            stormVaultReceive: result.readBigNumber(),
            usdtTlpReceive: result.readBigNumber(),
            usdtSlpReceive: result.readBigNumber()
        }
    }
}
