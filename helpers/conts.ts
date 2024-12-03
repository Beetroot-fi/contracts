import { Address } from "@ton/core"

export const TRADOOR_MASTER_ADDRESS = Address.parseRaw('0:ff1338c9f6ed1fa4c264a19052bff64d10c8ad028628f52b2e0f4b357a12227e');
export const STORM_VAULT_ADDRESS = Address.parseRaw('0:33e9e84d7cbefff0d23b395875420e3a1ecb82e241692be89c7ea2bd27716b77');
export const MAIN_USDT_SLP_JETTON_WALLET = Address.parseRaw('0:b083723e3d2e0fdecaa92f8d0cb7e6e8a0a820d9f40301241db352a42ce386ab');
export const MAIN_USDT_TLP_JETTON_WALLET = Address.parseRaw('0:7f730b8facc6932efe570adaa02ef0d605b4f553db8e9ebcb2156389cc4ed5c6');
export const USDT_JETTON_MINTER_ADDRESS = Address.parseRaw('0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe');
export const BEETROOT_JETTON_MINTER_ADDRESS = Address.parseRaw('0:4ced4a38e6c780e561bd1e68bf020d216abe4222d9e2d85a79a39293591a8889');
export const TRADOOR_USDT_JETTON_WALLET = Address.parseRaw('0:42c9f78585f8580572637e4a1c4c49142da933ba76e8e33dc6fb7e27b9ebbed2');
export const STORM_USDT_JETTON_WALLET = Address.parseRaw('0:056d522d028900f69d08d526997763c483b159408a78e3d993700b03fd0ae57d');
export const MAIN_USDT_JETTON_WALLET = Address.parseRaw('0:90dabeef9c4d1e87bf56ff9aa5097c65b07b55d9bd0b2b96d786aa249a5c24de');
export const ADMIN_ADDRESS = Address.parseRaw('0:c4f457c20b300464c3258981e8e7479e9617c7ce693f2c0472b9fb9077e5bd4c');

export const opCodes = {
    transfer: 260734629,
    transfer_notification: 1935855772,
    internal_transfer: 395134233,
    mint_usdt: 1680571655,
    mint: 21,
    change_admin: 3,
    deposit: 20,
    burn: 1499400124,
    burn_notification: 2078119902,
    withdraw_internal: 556,
    update_root_price: 344,
    upgrade_contract: 999,
}

export const errCodes = {
    not_parent: 544,
    not_child: 543,
    not_admin: 534,
    unknown_token: 533,
    unknown_op_code: 777,
}
