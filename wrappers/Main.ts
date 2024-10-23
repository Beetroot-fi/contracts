import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MainConfig = {
    usdtJettonMasterAddress: Address,
    rootMasterAddress: Address,
    userScCode: Cell,
    adminAddress: Address,
    usdtJettonWalletCode: Cell,
    jettonWalletCode: Cell,
};

export function mainConfigToCell(config: MainConfig): Cell {
    return beginCell()
        .storeAddress(config.usdtJettonMasterAddress)
        .storeAddress(config.rootMasterAddress)
        .storeRef(config.userScCode)
        .storeAddress(config.adminAddress)
        .storeRef(config.usdtJettonWalletCode)
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
        let usdtJettonMasterAddress = result.readAddress();
        let rootMasterAddress = result.readAddress();
        let userScCode = result.readCell();
        let adminAddress = result.readAddress();
        let usdtJettonWalletCode = result.readCell();
        let jettonWalletCode = result.readCell();

        return {
            usdtJettonMasterAddress,
            rootMasterAddress,
            userScCode,
            adminAddress,
            usdtJettonWalletCode,
            jettonWalletCode,
        }
    }
}
