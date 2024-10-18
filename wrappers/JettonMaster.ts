import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano, TupleItemSlice } from '@ton/core';

export type JettonMasterConfig = {
    totalSupply: bigint,
    adminAddress: Address,
    content: Cell,
    jettonWalletCode: Cell
};

export function jettonMasterConfigToCell(config: JettonMasterConfig): Cell {
    return beginCell()
        .storeCoins(config.totalSupply)
        .storeAddress(config.adminAddress)
        .storeRef(config.content)
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export class JettonMaster implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(address: Address) {
        return new JettonMaster(address);
    }

    static createFromConfig(config: JettonMasterConfig, code: Cell, workchain = 0) {
        const data = jettonMasterConfigToCell(config);
        const init = { code, data };
        return new JettonMaster(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId: bigint,
            toAddress: Address,
            jettonAmount: bigint,
        }
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(21, 32)
                .storeUint(opts.queryId, 64)
                .storeAddress(opts.toAddress)
                .storeCoins(toNano('0.02'))
                .storeRef(
                    beginCell()
                        .storeUint(0x178d4519, 32)
                        .storeUint(0n, 64)
                        .storeCoins(opts.jettonAmount)
                        .storeAddress(null)
                        .storeAddress(opts.toAddress)
                        .storeCoins(toNano('0.001'))
                        .storeBit(false)
                        .endCell()
                )
                .endCell(),
        });
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: {
            queryId: bigint,
            newAdminAddress: Address,
        }
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(3, 32)
                .storeUint(opts.queryId, 64)
                .storeAddress(opts.newAdminAddress)
                .endCell(),
        })
    }

    async getWalletAddress(provider: ContractProvider, ownerAddress: Address): Promise<Address> {
        const result = (await provider.get('get_wallet_address', [
            {
                type: "slice",
                cell: beginCell().storeAddress(ownerAddress).endCell()
            } as TupleItemSlice
        ])).stack

        return result.readAddress();
    }
}
