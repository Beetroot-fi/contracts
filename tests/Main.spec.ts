import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, toNano } from '@ton/core';
import { JettonWalletGoverned } from '../wrappers/JettonWalletGoverned';
import { JettonMaster } from '../wrappers/JettonMaster';
import { JettonMinter } from "../wrappers/Stablecoin"
import { opCodes } from '../helpers/conts';
import { compile } from '@ton/blueprint';
import { Main } from '../wrappers/Main';
import '@ton/test-utils';

describe('Main', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Main');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let main: SandboxContract<Main>;
    let usdtMaster: SandboxContract<JettonMinter>;
    let deployerUsdtJettonWallet: SandboxContract<JettonWalletGoverned>;
    let beetrootMaster: SandboxContract<JettonMaster>;
    let jettonWalletGovernedCode: Cell;
    let jettonWalletCode: Cell;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

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
        usdtMaster = blockchain.openContract(JettonMinter.createFromConfig({
            admin: deployer.address,
            wallet_code: jettonWalletGovernedCode,
            jetton_content: { uri: "https://raw.githubusercontent.com/welaskez/testnet-usdt-metadata/refs/heads/main/metadata.json" }
        }, await compile('Stablecoin')));

        const deployResultUsdt = await usdtMaster.sendDeploy(deployer.getSender(), toNano('1.5'));
        expect(deployResultUsdt.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtMaster.address,
            deploy: true,
            success: true,
        });

        // mint usdt for deployer
        const mintUsdtForDepolyerResult = await usdtMaster.sendMint(
            deployer.getSender(),
            deployer.address,
            toNano('3000'),
        );
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: usdtMaster.address,
            success: true,
            op: opCodes.mint_usdt,
        });
        deployerUsdtJettonWallet = blockchain.openContract(JettonWalletGoverned.createFromConfig({
            ownerAddress: deployer.address,
            jettonMasterAddress: usdtMaster.address,
        }, jettonWalletGovernedCode));
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: usdtMaster.address,
            to: deployerUsdtJettonWallet.address,
            deploy: true,
            success: true,
        });
        expect(mintUsdtForDepolyerResult.transactions).toHaveTransaction({
            from: deployerUsdtJettonWallet.address,
            to: deployer.address,
            success: true,
            op: opCodes.transfer_notification,
        });

        // deploy beetroot master
        beetrootMaster = blockchain.openContract(JettonMaster.createFromConfig({
            totalSupply: toNano('1000000000'),
            adminAddress: deployer.address,
            content: beginCell()
                .storeUint(0x01, 8)
                .storeStringTail('https://raw.githubusercontent.com/welaskez/test-jetton-metadata/refs/heads/main/metadata.json')
                .endCell(),
            jettonWalletCode: jettonWalletCode,
        }, await compile('JettonMaster')));

        const deployResultJettonMaster = await beetrootMaster.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResultJettonMaster.transactions).toHaveTransaction({
            from: deployer.address,
            to: beetrootMaster.address,
            deploy: true,
            success: true,
        });

        // deploy main sc
        main = blockchain.openContract(Main.createFromConfig({
            usdtJettonMasterAddress: usdtMaster.address,
            rootMasterAddress: beetrootMaster.address,
            userScCode: await compile('User'),
            adminAddress: deployer.address,
            jettonWalletGovernedCode: jettonWalletGovernedCode,
            jettonWalletCode: jettonWalletCode,
            rootPrice: 100n,
            evaaMasterAddress: Address.parse('EQC8rUZqR_pWV1BylWUlPNBzyiTYVoBEmQkMIQDZXICfnuRr'),
            tradoorMasterAddress: Address.parse('EQD_EzjJ9u0fpMJkoZBSv_ZNEMitAoYo9SsuD0s1ehIifnnn'),
            stormVaultAddress: Address.parse('EQAz6ehNfL7_8NI7OVh1Qg46HsuC4kFpK-icfqK9J3Frd6CJ'),
            usdtSlpJettonWallet: Address.parse('EQCup4xxCulCcNwmOocM9HtDYPU8xe0449tQLp6a-5BLEegW'),
            usdtTlpJettonWallet: Address.parse('EQAzLJFviFomBRyzoSHwDCvaRZM56xA982_khN8Lh7OThD9z'),
        }, code));
    });

    it('should deploy', async () => {
        const deployResult = await main.sendDeploy(deployer.getSender(), toNano('0.002'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: main.address,
            success: true,
            deploy: true,
            value: toNano('0.002'),
        })
    });
});
