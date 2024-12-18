import { Blockchain, RemoteBlockchainStorage, SandboxContract, wrapTonClient4ForRemote } from '@ton/sandbox';
import { JettonWalletGoverned } from '../wrappers/JettonWalletGoverned';
import { getHttpV4Endpoint } from '@orbs-network/ton-access';
import { beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { Main } from '../wrappers/Main';
import { User } from '../wrappers/User';
import { JettonMaster } from '../wrappers/JettonMaster';
import { TonClient4, WalletContractV4 } from '@ton/ton';
import { KeyPair, mnemonicToWalletKey } from "@ton/crypto"
import {
    MAIN_USDT_SLP_JETTON_WALLET,
    MAIN_USDT_TLP_JETTON_WALLET,
    TRADOOR_USDT_JETTON_WALLET,
    TRADOOR_MASTER_ADDRESS,
    STORM_VAULT_ADDRESS,
    errCodes,
    opCodes,
    USDT_JETTON_MINTER_ADDRESS,
    STORM_USDT_JETTON_WALLET,
    BEETROOT_JETTON_MINTER_ADDRESS,
    ADMIN_ADDRESS,
} from '../helpers/conts';
import '@ton/test-utils';
import { JettonMinter } from '../wrappers/Stablecoin';
import { JettonWallet } from '../wrappers/JettonWallet';


describe('Main', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Main');
    });

    let blockchain: Blockchain;
    let main: SandboxContract<Main>;
    let mainUsdtJettonWallet: SandboxContract<JettonWalletGoverned>;
    let mainBeetrootJettonWallet: SandboxContract<JettonWallet>;
    let jettonWalletGovernedCode: Cell;
    let admin: SandboxContract<WalletContractV4>;
    let keyPair: KeyPair;
    let jettonWalletCode: Cell;
    let adminUserSc: SandboxContract<User>;
    let adminUsdtJettonWallet: SandboxContract<JettonWalletGoverned>;
    let adminBeetrootJettonWallet: SandboxContract<JettonWallet>;
    let usdtMaster: SandboxContract<JettonMinter>;
    let beetrootMaster: SandboxContract<JettonMaster>;

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

        // getting deployer usdt jetton wallet
        adminUsdtJettonWallet = blockchain.openContract(JettonWalletGoverned.createFromConfig({
            ownerAddress: admin.address,
            jettonMasterAddress: usdtMaster.address,
        }, jettonWalletGovernedCode));

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

        const smc = await blockchain.getContract(main.address)
        console.log(smc.account.account?.storageStats.used)

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
        adminUserSc = blockchain.openContract(User.createFromAddress(await main.getUserScAddress(admin.address)));
        // getting deployer beetroot jetton wallet
        adminBeetrootJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(
            await beetrootMaster.getWalletAddress(admin.address)
        ));

        // getting main usdt jetton wallet 
        mainUsdtJettonWallet = blockchain.openContract(JettonWalletGoverned.createFromAddress(
            await usdtMaster.getWalletAddress(main.address)
        ));

        // getting main beetroot jetton wallet
        mainBeetrootJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(
            await beetrootMaster.getWalletAddress(main.address)
        ));
    });

    it('should receive USDT, send this to protocols * deploy user sc', async () => {
        const adminBalanceBefore = await adminUsdtJettonWallet.getJettonBalance();
        const result = await adminUsdtJettonWallet.sendTransfer(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.7'),
            BigInt(201 * 1e6),
            main.address,
            admin.address,
            null,
            toNano("0.65"),
            null,
        );

        // receive usdt
        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: adminUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: adminUsdtJettonWallet.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: main.address,
            success: true,
            op: opCodes.transfer_notification,
        });

        const currentRootPrice = (await main.getData()).rootPrice / 100n;
        const expectedRootMintValue = ((BigInt(201 * 1e6) - 1_000_000n) / currentRootPrice) * 1000n;  // 1 USDT fee

        // mint $ROOT for deployer
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: beetrootMaster.address,
            success: true,
            op: opCodes.mint,
        });
        expect(result.transactions).toHaveTransaction({
            from: beetrootMaster.address,
            to: adminBeetrootJettonWallet.address,
            success: true,
            deploy: true,
        });

        const deployerRootBalance = (await adminBeetrootJettonWallet.getWalletData()).balance
        expect(deployerRootBalance).toEqual(expectedRootMintValue);

        // check send $USDT to protocols
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: TRADOOR_USDT_JETTON_WALLET,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: TRADOOR_USDT_JETTON_WALLET,
            to: TRADOOR_MASTER_ADDRESS,
            success: true,
            op: opCodes.transfer_notification,
        });

        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: STORM_USDT_JETTON_WALLET,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: STORM_USDT_JETTON_WALLET,
            to: STORM_VAULT_ADDRESS,
            success: true,
            op: opCodes.transfer_notification,
        });

        // check send fee to admin
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: adminUsdtJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });

        const adminBalanceAfter = await adminUsdtJettonWallet.getJettonBalance();
        expect(adminBalanceAfter).toEqual(adminBalanceBefore - BigInt(200 * 1e6))

        // if we successful receive lp tokens 
        const mintUserInternalResult = await main.sendMintUserInternal(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.012'),
            {
                queryId: 0n,
                totalDepositAmount: BigInt(200 * 1e6),
                usdtSlpAmount: 0n,
                usdtTlpAmount: 0n,
                rootAmount: expectedRootMintValue,
                adminAddress: admin.address,
            }
        );
        expect(mintUserInternalResult.transactions).toHaveTransaction({
            from: admin.address,
            to: main.address,
            success: true,
        });
        expect(mintUserInternalResult.transactions).toHaveTransaction({
            from: main.address,
            to: adminUserSc.address,
            success: true,
            deploy: true,
            op: opCodes.deposit,
        });
        const deployerUserScData = await adminUserSc.getUserData();
        expect(deployerUserScData.adminAddress).toEqualAddress(admin.address);
        expect(deployerUserScData.mainScAddress).toEqualAddress(main.address);
        expect(deployerUserScData.rootAmount).toEqual(expectedRootMintValue);
        expect(deployerUserScData.totalDepositAmount).toEqual(BigInt(200 * 1e6));
    });

    it('should withdraw funds from protocols, burn root, update user sc & send usdt to user', async () => {
        // init
        await adminUsdtJettonWallet.sendTransfer(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.7'),
            BigInt(201 * 1e6),
            main.address,
            admin.address,
            null,
            toNano("0.65"),
            null,
        );

        const result = await adminBeetrootJettonWallet.sendTransfer(
            (await admin.sender(keyPair.secretKey)).result,
            {
                value: toNano('1'),
                toAddress: main.address,
                queryId: 0,
                fwdAmount: toNano('0.85'),
                jettonAmount: toNano('2'),
                forwardPayload: null,
            }
        )

        // send root
        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: adminBeetrootJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: adminBeetrootJettonWallet.address,
            to: mainBeetrootJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainBeetrootJettonWallet.address,
            to: main.address,
            success: true,
            op: opCodes.transfer_notification,
        });

        // burn root
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainBeetrootJettonWallet.address,
            success: true,
            op: opCodes.burn,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainBeetrootJettonWallet.address,
            to: beetrootMaster.address,
            success: true,
            op: opCodes.burn_notification,
        });
        expect((await mainBeetrootJettonWallet.getWalletData()).balance).toEqual(0n);

        // send withdraw internal to user sc
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: adminUserSc.address,
            success: true,
            op: opCodes.withdraw_internal,
        });

        // receive withdraw notification from user sc 
        expect(result.transactions).toHaveTransaction({
            from: adminUserSc.address,
            to: main.address,
            success: true,
            op: opCodes.withdraw_notification,
        });

        // withdraw funds from protocols
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: MAIN_USDT_SLP_JETTON_WALLET,
            success: true,
            op: opCodes.burn,
        });
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: MAIN_USDT_TLP_JETTON_WALLET,
            success: true,
            op: opCodes.transfer
        });

        // receive usdt
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: main.address,
            success: true,
            op: opCodes.transfer_notification
        });

        // send successful withdraw 
        const successfulWithdrawResult = await main.sendSuccessfulWithdraw(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.012'),
            {
                queryId: 0n,
                usdtAmount: BigInt(200 * 1e6),
                adminAddress: admin.address,
            }
        );
        expect(successfulWithdrawResult.transactions).toHaveTransaction({
            from: admin.address,
            to: main.address,
            success: true,
            op: opCodes.successful_withdraw,
        });

        // send usdt to user
        expect(result.transactions).toHaveTransaction({
            from: main.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: adminUsdtJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
    });

    it('should throw error if not root or usdt received', async () => {
        const fakeJetton = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: 0n,
            adminAddress: main.address,
            content: beginCell().storeUint(0x01, 8).storeStringTail('some_metadata_link').endCell(),
            jettonWalletCode: jettonWalletCode
        }, await compile('JettonMaster')));

        await fakeJetton.sendMint(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.05'),
            {
                queryId: 0n,
                toAddress: admin.address,
                jettonAmount: toNano('1')
            }
        )

        const adminFakeJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(
            await fakeJetton.getWalletAddress(admin.address)
        ));

        const mainFakeJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(
            await fakeJetton.getWalletAddress(main.address)
        ))

        const result = await adminFakeJettonWallet.sendTransfer(
            (await admin.sender(keyPair.secretKey)).result,
            {
                value: toNano('1'),
                toAddress: main.address,
                queryId: 0,
                fwdAmount: toNano('0.85'),
                jettonAmount: toNano('1'),
                forwardPayload: null,
            }
        );
        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: adminFakeJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: adminFakeJettonWallet.address,
            to: mainFakeJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer
        });
        expect(result.transactions).toHaveTransaction({
            from: mainFakeJettonWallet.address,
            to: main.address,
            success: false,
            exitCode: errCodes.unknown_token,
            op: opCodes.transfer_notification,
        });
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

    it('should not upgrade contract if not admin', async () => {
        const user = await blockchain.treasury('user');

        const result = await main.sendUpgradeContract(
            user.getSender(),
            0n,
            toNano('0.05'),
            beginCell().endCell(),
            beginCell().endCell(),
        )
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: false,
            exitCode: errCodes.not_admin,
        });
    });

    it('should not update root price if not admin', async () => {
        const user = await blockchain.treasury('user');

        const result = await main.sendUpdateRootPrice(
            user.getSender(),
            toNano('0.05'),
            0n,
            101n,
        )
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: false,
            exitCode: errCodes.not_admin,
        });
    });

    it('should throw error if not enough tons to gas', async () => {
        const result = await adminUsdtJettonWallet.sendTransfer(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.6'),
            toNano('100'),
            main.address,
            admin.address,
            null,
            toNano('0.5'),
            null,
        );
        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: adminUsdtJettonWallet.address,
            success: true,
            op: opCodes.transfer,
        })
        expect(result.transactions).toHaveTransaction({
            from: adminUsdtJettonWallet.address,
            to: mainUsdtJettonWallet.address,
            success: true,
            op: opCodes.internal_transfer,
        });
        expect(result.transactions).toHaveTransaction({
            from: mainUsdtJettonWallet.address,
            to: main.address,
            success: false,
            exitCode: errCodes.not_enough_gas,
        });
    });

    it('should throw error if not user contract request withdraw', async () => {
        const user = await blockchain.treasury('user');

        const result = await user.send({
            to: main.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(opCodes.withdraw_notification, 32)
                .storeUint(0, 64)
                .storeAddress(user.address)
                .storeCoins(0)
                .storeCoins(0)
                .endCell()
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: main.address,
            success: false,
            exitCode: errCodes.not_child,
        });
    });

    it('should upgrade contract', async () => {
        const result = await main.sendUpgradeContract(
            (await admin.sender(keyPair.secretKey)).result,
            toNano('0.05'),
            0n,
            await compile('Main'),
            beginCell()
                .storeAddress(USDT_JETTON_MINTER_ADDRESS)
                .storeAddress(BEETROOT_JETTON_MINTER_ADDRESS)
                .storeRef(await compile('User'))
                .storeAddress(ADMIN_ADDRESS)
                .storeRef(jettonWalletGovernedCode)
                .storeRef(jettonWalletCode)
                .storeRef(
                    beginCell()
                        .storeAddress(TRADOOR_MASTER_ADDRESS)
                        .storeAddress(STORM_VAULT_ADDRESS)
                        .storeRef(
                            beginCell()
                                .storeAddress(MAIN_USDT_SLP_JETTON_WALLET)
                                .storeAddress(MAIN_USDT_TLP_JETTON_WALLET)
                                .endCell()
                        )
                        .endCell()
                )
                .storeUint(100, 64)
                .endCell()
        );

        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: main.address,
            success: true,
            op: opCodes.upgrade_contract,
        });
    });

    it('should update root price', async () => {
        const result = await main.sendUpdateRootPrice((await admin.sender(keyPair.secretKey)).result, toNano('0.05'), 0n, 101n);

        expect(result.transactions).toHaveTransaction({
            from: admin.address,
            to: main.address,
            success: true,
            op: opCodes.update_root_price,
        });
        expect((await main.getData()).rootPrice).toEqual(101n);
    });
});
