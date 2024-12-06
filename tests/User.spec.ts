import { Blockchain, RemoteBlockchainStorage, SandboxContract, wrapTonClient4ForRemote } from '@ton/sandbox';
import { Cell, toNano, beginCell, Dictionary } from '@ton/core';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonMinter } from '../wrappers/Stablecoin';
import {
    errCodes,
    MAIN_USDT_SLP_JETTON_WALLET,
    MAIN_USDT_TLP_JETTON_WALLET,
    opCodes, STORM_VAULT_ADDRESS,
    TRADOOR_MASTER_ADDRESS,
    USDT_JETTON_MINTER_ADDRESS
} from '../helpers/conts';
import { compile } from '@ton/blueprint';
import { User } from '../wrappers/User';
import { Main } from '../wrappers/Main';
import { TonClient4, WalletContractV4 } from '@ton/ton';
import '@ton/test-utils';
import { KeyPair, mnemonicToWalletKey } from '@ton/crypto';

describe('User', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('User');
    });

    let blockchain: Blockchain;
    let admin: SandboxContract<WalletContractV4>;
    let adminUserSc: SandboxContract<User>;
    let main: SandboxContract<Main>;
    let keyPair: KeyPair;
    let usdtMaster: SandboxContract<JettonMinter>;
    let beetrootMaster: SandboxContract<JettonMaster>;
    let jettonWalletGovernedCode: Cell;
    let jettonWalletCode: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create({
            storage: new RemoteBlockchainStorage(wrapTonClient4ForRemote(new TonClient4({
                endpoint: await getHttpV4Endpoint({
                    network: 'mainnet'
                }),
            })))
        })

        // jetton wallet governed
        const jettonWalletCodeGovernedRaw = await compile('JettonWalletGoverned');

        // install libs on blockchain
        const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
        _libs.set(BigInt(`0x${jettonWalletCodeGovernedRaw.hash().toString('hex')}`), jettonWalletCodeGovernedRaw);
        const libs = beginCell().storeDictDirect(_libs).endCell();
        blockchain.libs = libs;
        let lib_prep = beginCell().storeUint(2, 8).storeBuffer(jettonWalletCodeGovernedRaw.hash()).endCell();
        jettonWalletGovernedCode = new Cell({ exotic: true, bits: lib_prep.bits, refs: lib_prep.refs });

        // jetton wallet
        jettonWalletCode = await compile('JettonWallet');

        // deploy usdt master
        usdtMaster = blockchain.openContract(JettonMinter.createFromAddress(USDT_JETTON_MINTER_ADDRESS));
        keyPair = await mnemonicToWalletKey(process.env.MNEMONICS!.split(' '))
        admin = blockchain.openContract(WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey, walletId: 698983191 }))

        beetrootMaster = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: 1_000_000_000n,
            adminAddress: admin.address,
            content: beginCell()
                .storeUint(0x01, 8)
                .storeStringTail('https://raw.githubusercontent.com/welaskez/test-jetton-metadata/refs/heads/main/metadata.json')
                .endCell(),
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonMaster')));

        // deploy main sc
        main = blockchain.openContract(Main.createFromConfig({
            usdtJettonMasterAddress: usdtMaster.address,
            rootMasterAddress: beetrootMaster.address,
            userScCode: await compile('User'),
            adminAddress: admin.address,
            jettonWalletGovernedCode: jettonWalletGovernedCode,
            jettonWalletCode: jettonWalletCode,
            rootPrice: 10000n,
            tradoorMasterAddress: TRADOOR_MASTER_ADDRESS,
            stormVaultAddress: STORM_VAULT_ADDRESS,
            usdtSlpJettonWallet: MAIN_USDT_SLP_JETTON_WALLET,
            usdtTlpJettonWallet: MAIN_USDT_TLP_JETTON_WALLET,
        }, code));
        const deployResult = await main.sendDeploy((await admin.sender(keyPair.secretKey)).result, toNano('0.002'));
        expect(deployResult.transactions).toHaveTransaction({
            from: admin.address,
            to: main.address,
            success: true,
            deploy: true,
            value: toNano('0.002'),
        });

        // change beetroot master owner
        const changeBeetrootMasterOwnerResult = await beetrootMaster.sendChangeAdmin((await admin.sender(keyPair.secretKey)).result, toNano('0.05'), {
            queryId: 0n,
            newAdminAddress: main.address
        });
        expect(changeBeetrootMasterOwnerResult.transactions).toHaveTransaction({
            from: admin.address,
            to: beetrootMaster.address,
            success: true,
            op: opCodes.change_admin,
        });
        expect((await beetrootMaster.getJettonData()).adminAddress).toEqualAddress(main.address);

        // getting deployer sc
        adminUserSc = blockchain.openContract(User.createFromConfig({
            adminAddress: admin.address,
            mainScAddress: main.address,
        }, await compile('User')));
    });

    it('should not receive deposit from not main', async () => {
        const result = await main.sendDeposit(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.5'),
            {
                queryId: 0n,
                totalDepositAmount: 100n,
                usdtSlpAmount: 100n,
                usdtTlpAmount: 100n,
                rootAmount: 10n,
            }
        )
        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: adminUserSc.address,
            success: false,
            exitCode: errCodes.not_parent,
        })
    });

    it('should not receive withdraw internal not from main', async () => {
        const result = await main.sendWithdrawInternal(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.5'),
            {
                queryId: 0n,
                jettonAmount: 100n,
            }
        )
        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: adminUserSc.address,
            success: false,
            exitCode: errCodes.not_parent,
        })
    });

    it('should throw error if wrong op code', async () => {
        const user = await blockchain.treasury('user');

        const result = await user.send({
            to: main.address,
            value: toNano('0.05'),
            body: beginCell().storeUint(123, 32).storeUint(0, 64).endCell(),
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: false,
            exitCode: errCodes.unknown_op_code,
        });
    });
});
