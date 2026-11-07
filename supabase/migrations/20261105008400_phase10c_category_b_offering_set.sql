-- Phase 10C: Category B offering identity + recipe fingerprint allowlist.
-- Binds approved_filtered_within_limit to specific drink@bar + recipe evidence.

create table if not exists public.catalog_category_b_approved_offerings (
  approval_id text not null,
  drink_key text not null,
  bar_key text not null,
  recipe_fingerprint text not null check (recipe_fingerprint ~ '^[a-f0-9]{64}$'),
  primary key (approval_id, drink_key, bar_key)
);

comment on table public.catalog_category_b_approved_offerings is
  'Phase 10C: Category B approved offering identities. New drinks at authorized bars cannot inherit Category B by copying approval_id alone.';

revoke all on table public.catalog_category_b_approved_offerings from public, anon, authenticated;
grant select on table public.catalog_category_b_approved_offerings to service_role;

insert into public.catalog_category_b_approved_offerings (
  approval_id, drink_key, bar_key, recipe_fingerprint
) values
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'bellinis-cocktail-bar', '921ce7b8dd3ba0695ee3dd6ec681eba0cc2e874004df6382cae066ad1e252a5b'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'cascade-bar', '03ddb50d284473fb8a7fdf2495a3260d927a6c5f8e88f77721bf4b31b87931c2'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'crooners', '0c4ae8c397dd2fa28ff2e9b6e9a8dbb7604e69c9cc8e6391dea9ae9fca0b981b'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'lido-bar', '6a1c372a615592c03ae51a30a6658292a4337f8e8fa9429a9aaa005d0db78f46'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'princess-live', '925df3a6d8498cafbe43943dcda844ec6f32802a28802fe8ae9d7a0dcb8753e4'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'promenade-bars', '918a3b9c2326eae02a4e13078c8b251206bf6b7f944c32c1bdb520f1d432918a'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'sea-view-bar', 'a842a4c465ae1377b37f63d90f1809f8c3405c0f4a9b73721d3c6f8eb7d4d461'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'star-bar', '1de0aab9df073428595a5c888c736efd9544cc20671e2d9b93f1052ec2b1d0c3'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'the-mix', '655ca09e2af789e856a0e53209ab29168436b9670c3c27af6f1bcd54b98b544d'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'wake-view-bar', '4a657ba5fab9492cbf33740a622ac3b3103a3e0892144ce2925f4108279bfb2b'),
  ('star-princess-filtered-source-2026-11-07', '24k-margarita', 'wheelhouse-bar', 'd2ba0014e4a185ba5b7bbf368aca3ce56b86f79a0d737ac4a6e43cdd4354a0bf'),
  ('star-princess-filtered-source-2026-11-07', 'almond-italia', 'bellinis-cocktail-bar', '501a095a07bd8dc71c5a5c3a76b26df56bf5a9a3d80032c2437246f22f2806ef'),
  ('star-princess-filtered-source-2026-11-07', 'amazonia', 'cascade-bar', '1c88ab62d283273892e6bef560221d9255d6c64300a5ac8b852227162ee7e009'),
  ('star-princess-filtered-source-2026-11-07', 'aperol-coconut-margarita', 'sea-view-bar', 'c6bd26addcb26f0c5bd971ee5fd01da926a15b635f732c122f1c11ee4f338bc7'),
  ('star-princess-filtered-source-2026-11-07', 'aperol-frose', 'sea-view-bar', '8e725f90bdadde87f61559f1850577d01fe9146fb95dc09e46020f114ef0b629'),
  ('star-princess-filtered-source-2026-11-07', 'aperol-frose', 'wake-view-bar', '25b2043fd7615fa61fdad46aa752eb0cfa5a64d928637f26727d085615783365'),
  ('star-princess-filtered-source-2026-11-07', 'aperol-spritz', 'bellinis-cocktail-bar', '68463ae05c22270053dcf03556a9e42c51cd40483e4c22ef079b77707a193f8a'),
  ('star-princess-filtered-source-2026-11-07', 'banana-biscotti', 'bellinis-cocktail-bar', '1da3ad3d24358e543fd2f54e16e0d209e8d7d0026bf77221966767f05429de45'),
  ('star-princess-filtered-source-2026-11-07', 'banoffee-bliss', 'omalleys-irish-pub', '74f3cf8d7936204b726dfe0e9f0d62c6ed95706359e7a8c41f1e5dc24e98f20d'),
  ('star-princess-filtered-source-2026-11-07', 'blue-pineapple-margarita', 'wake-view-bar', 'f17622c3461fd0b675b799b08f03d95a9370ba04788ba43b1987ff2a24641f79'),
  ('star-princess-filtered-source-2026-11-07', 'cant-feel-the-rain', 'lido-bar', '73feb1ad3f1e4cb8f113d8cba2f0834bd4a2cacbe99517d74d1df7ed60eab460'),
  ('star-princess-filtered-source-2026-11-07', 'cant-feel-the-rain', 'promenade-bars', '0a81ed60c91256bdfd5a2d69fd70a85cb14de4f39de29f84f4376a433a2261cd'),
  ('star-princess-filtered-source-2026-11-07', 'cant-feel-the-rain', 'star-bar', '0805b4f8b00c41d7155e22d90d4ec483bdbecb0df14ea0cdd06d558c4e4d2173'),
  ('star-princess-filtered-source-2026-11-07', 'cant-feel-the-rain', 'the-mix', '5b1b3dc4f17cd1041c957eddaf4fc5eba332ec36d703f89a0d9f2ab426909f2b'),
  ('star-princess-filtered-source-2026-11-07', 'cask-and-coco', 'crooners', '13674c61b9a7c36d4407e86cc32377603bad835844ec39c22bd354437a0295c3'),
  ('star-princess-filtered-source-2026-11-07', 'caught-in-the-rip-tide', 'cascade-bar', 'f25441f51957607a48438a95c38b23659ea34893a2a6f2cc75d15f0a89e1dc48'),
  ('star-princess-filtered-source-2026-11-07', 'central-park', 'wheelhouse-bar', 'f0cdad88bf1385fd1eb7fbab9fce012593089f0a713cc61212de429f3018f5fa'),
  ('star-princess-filtered-source-2026-11-07', 'chocolate-orange-carajillo', 'sea-view-bar', 'b2e697db8573e4bfac1e0a9f4635ba105949e98811b712e1a1b14541063d25a6'),
  ('star-princess-filtered-source-2026-11-07', 'chocolate-orange-espresso-tini', 'princess-live', '4bd9697b4b060c7e8c18fac06e1b86a648cd6ef6ffb780cb8387d815f4170997'),
  ('star-princess-filtered-source-2026-11-07', 'classic-coffee', 'omalleys-irish-pub', '5e544e1495684b3c878d35b81797f160d3f4994e5b35e9602646cb9e25859b13'),
  ('star-princess-filtered-source-2026-11-07', 'classic-cosmo', 'crooners', '3fc5fdb3b7c251eed449875c9933b36ecb3e31770dc4a283f786a676a4d76169'),
  ('star-princess-filtered-source-2026-11-07', 'cloudy-skies', 'cascade-bar', '19f14fa7ef840ac0e4141b4590ce2dbfdbee44c30b100611ab41fc132c4d4157'),
  ('star-princess-filtered-source-2026-11-07', 'clover-breeze', 'omalleys-irish-pub', '683d1a38816aa3ee63b8af4aa636e6607f7324fb14b4e6eca417c014f97474b9'),
  ('star-princess-filtered-source-2026-11-07', 'clover-club', 'crooners', 'fe1d0a3bcaee797b786c5080eebab9c9c17c3acd3a24a4d539c506d0b729f709'),
  ('star-princess-filtered-source-2026-11-07', 'coconut-margarita', 'lido-bar', '203bb65df52579823a2411f323d157b9e90acaf662ee2a3a114e03d56772635d'),
  ('star-princess-filtered-source-2026-11-07', 'coconut-margarita', 'promenade-bars', 'fd60a2d94ec03321917838bdb1f26818d55d341dac2cea34612e192fcda33cc9'),
  ('star-princess-filtered-source-2026-11-07', 'coconut-margarita', 'star-bar', 'a80af94b69bcfeb3087a0a8b18bfac8e8d5b3c973be9eced585d43b6763a9102'),
  ('star-princess-filtered-source-2026-11-07', 'coconut-margarita', 'the-mix', '19378fac0ba431229c950bc120b4f9f89d22efd3cf6e4cb1340b0ad64cea2999'),
  ('star-princess-filtered-source-2026-11-07', 'cosmopolitan', 'princess-live', 'a61c53f2e396610bdd9b8daed85795cb7bd806723366028d74a213fe2f9308fe'),
  ('star-princess-filtered-source-2026-11-07', 'creme-brulee-tiramisu', 'bellinis-cocktail-bar', '20de2826fa6eb42d869cd94f38e51e5afc4e0499843ca919d28241c3472575b5'),
  ('star-princess-filtered-source-2026-11-07', 'crimson-current', 'cascade-bar', '7b362eee2a54028728973f144d7c9ebb804e5e3423d11d5e207180896516bda9'),
  ('star-princess-filtered-source-2026-11-07', 'crooners-signature-007', 'crooners', '82378b111f340af24adda020f8138209e1760564643c80b950c588556546a1c4'),
  ('star-princess-filtered-source-2026-11-07', 'cucumber-elderflower', 'princess-live', 'fa3e77cce1d13d94ae39428de68626b47a80c9191b891dddf38c13f20e00b17f'),
  ('star-princess-filtered-source-2026-11-07', 'dark-and-stormy', 'wheelhouse-bar', '84130f5c1b6c0241beaf4ce7442aef2cdf4c7a5086fadd67a83ddf4ae04db0b3'),
  ('star-princess-filtered-source-2026-11-07', 'dragon-fruit-mojito', 'sea-view-bar', '3c96e23ded4ba6f37d78846183ec07001780075b16f36570af740a1a2d44e41e'),
  ('star-princess-filtered-source-2026-11-07', 'dragon-fruit-refresher', 'wake-view-bar', 'c95ea87577ac8794b3c7600b242b1fe8a385b80e6532ba480a23bdf6fdae04b2'),
  ('star-princess-filtered-source-2026-11-07', 'ferrero', 'crooners', 'cf507f09ccda348d3ffb1374ab1f8337d001f903eb14a258d0182bbe409c55e0'),
  ('star-princess-filtered-source-2026-11-07', 'ferrero', 'princess-live', '8583eabd56d2b7bc5250c7ff492bd174335b50f70763fc7ece3560df46e34518'),
  ('star-princess-filtered-source-2026-11-07', 'figs-and-honey', 'crooners', '58c697d8e26988ba9ad08f8f9c44b2428db9bdac6b449736e1c2ecd5a7a09c4a'),
  ('star-princess-filtered-source-2026-11-07', 'french-martini', 'crooners', '41fdc61978d68de842ef7ed529a5024f631266f58bbf985caac47d72a98f4fcc'),
  ('star-princess-filtered-source-2026-11-07', 'french-martini', 'princess-live', '641040b56209743f9f9821b5492ecd46976983dfbbc4a13ba811b90799d408eb'),
  ('star-princess-filtered-source-2026-11-07', 'frose', 'lido-bar', '3c6abb298bef257e226a10a65614a58c37bc9365a164f0b35428b989a6aeb745'),
  ('star-princess-filtered-source-2026-11-07', 'frose', 'princess-live', '52df1b97c6efdc05f60701cf3f381f4e28bdaa00e3665a44a8e710d9f2bccd8e'),
  ('star-princess-filtered-source-2026-11-07', 'frose', 'promenade-bars', 'bdb68cb47c7137268d4adee1cfce23fae6bad90f2287d941885f0c8af2d3a08c'),
  ('star-princess-filtered-source-2026-11-07', 'frose', 'star-bar', '2c148be39bb184a37848f3a80990bad4b2cd851c421b43c37334c5b0d39b371a'),
  ('star-princess-filtered-source-2026-11-07', 'frose', 'the-mix', 'e0bb7600b832f8424cb1aa17f120dec3fa5c92d9ae9a1dea40a603e1de361bc6'),
  ('star-princess-filtered-source-2026-11-07', 'frozen-aperol-spritz', 'lido-bar', '76145f4f2a7e7fa703f6071067a060936abb57535b44d603febbe10cbfe740f8'),
  ('star-princess-filtered-source-2026-11-07', 'frozen-aperol-spritz', 'promenade-bars', '3d56411034486494d5d9fad7534ff006e54730385e2be63b045a2dbd873985f5'),
  ('star-princess-filtered-source-2026-11-07', 'frozen-aperol-spritz', 'sea-view-bar', '287cec9e959f2a8d31cf1804e7822b15a8e35651bac466cad5ba7e370c226195'),
  ('star-princess-filtered-source-2026-11-07', 'frozen-aperol-spritz', 'star-bar', '26b33ea89dd5e8e06b0afbd9175219e479ceffc525264da4a58dfe09ec311f7a'),
  ('star-princess-filtered-source-2026-11-07', 'frozen-aperol-spritz', 'the-mix', '7e0dbeb08abf6a00cfc4491432c5f246d758e933bd81a7efffab6e750d80de55'),
  ('star-princess-filtered-source-2026-11-07', 'frozen-aperol-spritz', 'wake-view-bar', 'b3e713527756fb207506f8cb705c69ce33f5ab0b3474c5686e36a2cfd43f9d6a'),
  ('star-princess-filtered-source-2026-11-07', 'glacier-water', 'cascade-bar', '97dbde8a413e1e77355017acc7e16dcb7b0abd5c61ced4a0a03982462e983995'),
  ('star-princess-filtered-source-2026-11-07', 'grilled-pineapple-carajillo', 'sea-view-bar', 'e631451b45b6355484705c944bc8826e05420c0bf6420fca240f61bff94129c5'),
  ('star-princess-filtered-source-2026-11-07', 'guava-margarita', 'lido-bar', '9dbea0b8e6c7629ce14ef4ec61757cc174c8bc06c47d8fcf214bac883d85d193'),
  ('star-princess-filtered-source-2026-11-07', 'guava-margarita', 'promenade-bars', 'd820d3231751d94e9a990cb6ba344ff2eed1c1d9e4b454983e1ebdf905adb5e3'),
  ('star-princess-filtered-source-2026-11-07', 'guava-margarita', 'star-bar', 'bb41913481000862d3cdbadc0f06d2ecb0d91cc661728570392cda4996818d10'),
  ('star-princess-filtered-source-2026-11-07', 'guava-margarita', 'the-mix', '5765e36d059d3927c17930ab8c9e9a7705c8fa493e1b9a9f770a66dd0966a2c1'),
  ('star-princess-filtered-source-2026-11-07', 'hampton-spritz', 'bellinis-cocktail-bar', '4ca7fed81e39216abd81a707ae4e06ea6e6c03b41a096d0eb66fa99f2aa9a1c0'),
  ('star-princess-filtered-source-2026-11-07', 'hampton-spritz', 'crooners', '64b06ab7f9ac158a2e1530a6981e6a881bbb09e07e3b4eeebc5fca9e252b965e'),
  ('star-princess-filtered-source-2026-11-07', 'hampton-spritz', 'lido-bar', '70903ce19b89c280d064dce84f518ee7721be8f31e23d95b39b2592ddfa8e17c'),
  ('star-princess-filtered-source-2026-11-07', 'hampton-spritz', 'promenade-bars', 'dedc6f1e2b019daa2fd67b73d458429514dbde6ee74398787201e5dce69b6f16'),
  ('star-princess-filtered-source-2026-11-07', 'hampton-spritz', 'star-bar', '78c7ae7379882ba490e0dfbac091c84d7e17873e91ce9f97e5b65be90ce6a9b9'),
  ('star-princess-filtered-source-2026-11-07', 'hampton-spritz', 'the-mix', '5fd728a55ca9bf01ead13a774b2cc4d0b13b3e86c7a24de064198b4c85536a9f'),
  ('star-princess-filtered-source-2026-11-07', 'hampton-spritz', 'wheelhouse-bar', 'a46da48a3633bbaf5f84ed290c392a9deefd5221549164d5dba729151d12d02b'),
  ('star-princess-filtered-source-2026-11-07', 'honey-sweet-bourbon', 'cascade-bar', '2efce43b32eabd69b81700da632875e027ca042945d3b4b5a9f2e8c7cf9ed49f'),
  ('star-princess-filtered-source-2026-11-07', 'honey-sweet-bourbon', 'lido-bar', '58da46cfe9029773d13b9ddf28c070fea2c9966afb4d4d6fc44eb58925eb6e62'),
  ('star-princess-filtered-source-2026-11-07', 'honey-sweet-bourbon', 'princess-live', 'a2ff8053d82b3f8e926f74f71276926b8df174922269ee2de62e11d7dcd12698'),
  ('star-princess-filtered-source-2026-11-07', 'honey-sweet-bourbon', 'promenade-bars', '40e4cd4e125b496649ee8f8f57995f44c9a2dddd4eb792c47ac5cb4b252d8c54'),
  ('star-princess-filtered-source-2026-11-07', 'honey-sweet-bourbon', 'star-bar', '695c8a7bad32711f5995885df3e1701a81b0f3b05b65d99c048df59ba4ed45db'),
  ('star-princess-filtered-source-2026-11-07', 'honey-sweet-bourbon', 'the-mix', '6f6a799e0925d31fb9cf1847617a5ffe32f97e205b36c2db1c2fd3d925f63acc'),
  ('star-princess-filtered-source-2026-11-07', 'honey-sweet-bourbon', 'wake-view-bar', '30570c210fac091f723809385273e95dd66de8fc9d30d3397aa04acb08befcbc'),
  ('star-princess-filtered-source-2026-11-07', 'hotel-nacional', 'wheelhouse-bar', 'd6403e34dbe58247d280460597218d8b0d163f0304c174b1b51aa3e4cded6553'),
  ('star-princess-filtered-source-2026-11-07', 'hugo-spritz', 'bellinis-cocktail-bar', '7a75dd50febf9d46bc9abf94455cd40d9992928a7c9df87129a75215c42063c0'),
  ('star-princess-filtered-source-2026-11-07', 'italian-sparrow', 'bellinis-cocktail-bar', 'a953140d843dde07efb0027e29228e8d66768cf05d6cafebcb14c98e0453ab36'),
  ('star-princess-filtered-source-2026-11-07', 'june-bug', 'princess-live', '1fdca51facb0e3ffb7db12d3620d570ac9168e378127f2e103b3d8b6f875f02d'),
  ('star-princess-filtered-source-2026-11-07', 'jungle-bird', 'lido-bar', '5152ba755fa6d2c73d495590a1e7069b02b8911bcd8cf3063c52a2386ec587f4'),
  ('star-princess-filtered-source-2026-11-07', 'jungle-bird', 'promenade-bars', 'afd01beeaea85cb443ef0787b41b74968a9b8326cd1e604444f5680ffa875330'),
  ('star-princess-filtered-source-2026-11-07', 'jungle-bird', 'star-bar', 'cd300c21e7f94b634c62e10f23e5335af48b13f1b9e7beac0c6cd1b96d9890ea'),
  ('star-princess-filtered-source-2026-11-07', 'jungle-bird', 'the-mix', 'e0d1974ba36f7ddbcbb7a14498fe54313d96830a53c0b9494bfa4b60800bec9b'),
  ('star-princess-filtered-source-2026-11-07', 'lilypad', 'cascade-bar', '3d46f16ca8b1871644b80dcae5e9901fbb23b73f7d291219dbfd67b53472e407'),
  ('star-princess-filtered-source-2026-11-07', 'limecello-spritz', 'bellinis-cocktail-bar', '2677059eb82d8ca5c50d2bc17abb829772745bae8b4532a6e5dd672a0b636b92'),
  ('star-princess-filtered-source-2026-11-07', 'lychee-vodka-mojito', 'lido-bar', 'da13d8478e0165ad66575db367cc0a9d8e330c4a428700555756302b000b2f0a'),
  ('star-princess-filtered-source-2026-11-07', 'lychee-vodka-mojito', 'promenade-bars', '5ea4310395f8bf4f99aa29fc858d02ddcb9970ce8daff4ad1fa9d767f0e06a90'),
  ('star-princess-filtered-source-2026-11-07', 'lychee-vodka-mojito', 'star-bar', '1e692083a1dda9373c81863c28857df96bbcd179fb8f84f94ab1769c3e19480e'),
  ('star-princess-filtered-source-2026-11-07', 'lychee-vodka-mojito', 'the-mix', 'c78902537e0c52169123804fb489cec9bb28d6029bc86898e8541a0bddff702b'),
  ('star-princess-filtered-source-2026-11-07', 'maid-of-the-sea', 'omalleys-irish-pub', '9c2c0eda858aa7f0d33d0a8f883de82929f2f66bcc39177d35be5d57a4989f3e'),
  ('star-princess-filtered-source-2026-11-07', 'mango-mai-tai', 'wheelhouse-bar', '13c710e2e6505adc17eb6f9f7a6974f22b3b431492e6d2fce95f28e3175e7f1d'),
  ('star-princess-filtered-source-2026-11-07', 'meili-paloma-2-0', 'lido-bar', '9b3b3165094bbbc761a6e7e6086fb12e096b5a5f307b38d3835f25f9b98baf13'),
  ('star-princess-filtered-source-2026-11-07', 'meili-paloma-2-0', 'princess-live', 'bdb3a8f37758d87e7d7ec55ce59418ee6519e7c4c1fa1b98a288b186132991fb'),
  ('star-princess-filtered-source-2026-11-07', 'meili-paloma-2-0', 'promenade-bars', '7ec048aaa1940431ce8665c122db7489057c78bae7a73dc862bf7ef11d9d7fe4'),
  ('star-princess-filtered-source-2026-11-07', 'meili-paloma-2-0', 'sea-view-bar', '86a69fb7d200ba0c38b15a071c68d715e54ade09fb2eaa1150fc90c05fb13127'),
  ('star-princess-filtered-source-2026-11-07', 'meili-paloma-2-0', 'star-bar', '555038918974d47d6b2cfe354c0ff76744e17f2535645f7bae8a37041583567d'),
  ('star-princess-filtered-source-2026-11-07', 'meili-paloma-2-0', 'the-mix', 'e506eb57079e94795246c3fec83a1c5c371c6a6eff12345953e1300157651349'),
  ('star-princess-filtered-source-2026-11-07', 'meili-paloma-2-0', 'wake-view-bar', '41fa1dd088d63747bb5b1b84570b4a4b2f5cbad4fe0269921914c16a274d3f05'),
  ('star-princess-filtered-source-2026-11-07', 'montana-springs', 'cascade-bar', '016214b943deb4c238774bb10ad64e9e1b8d08b43cc67cf5960a63ce4fb6e440'),
  ('star-princess-filtered-source-2026-11-07', 'new-york-sour', 'wheelhouse-bar', '6069291639d26223c46f8e2c1e20596b5d5dac80f1ab97ab16eb3f11da0c0af3'),
  ('star-princess-filtered-source-2026-11-07', 'ocean-dreams', 'wake-view-bar', 'ee62a6d3235ea4ea3194e64bb91f0bb7917fee5ccd931372194fd6e3f1deb54a'),
  ('star-princess-filtered-source-2026-11-07', 'painkiller', 'wheelhouse-bar', '5cba57f417e403972f9d9f0cfc86a4e9836e8bfd4122ad9247ac77959f998d2a'),
  ('star-princess-filtered-source-2026-11-07', 'pair-of-queens', 'omalleys-irish-pub', 'bd6c6b9835adebd48daaaaa88bf65fac46ce4163d1992ca121a9a2bca9ace08c'),
  ('star-princess-filtered-source-2026-11-07', 'pantalones-tequila-sunrise', 'sea-view-bar', 'ef0ddf135c9f742f284a7c95bc48e384b712a271db617d47fba452e5612b2d8c'),
  ('star-princess-filtered-source-2026-11-07', 'pantalones-tequila-sunrise', 'wake-view-bar', '218a10c6b7c291678aa77b0f7ce56667359981af68493853c5b5b4d8a82cda91'),
  ('star-princess-filtered-source-2026-11-07', 'passion-fruit-chili-margarita', 'princess-live', 'bb80be4341b0a9945b10c8265d2664e8ce52adeee626948e274b2084f16bbc79'),
  ('star-princess-filtered-source-2026-11-07', 'passion-fruit-vanilla-sour', 'princess-live', 'c9887d08e4d63ec2d59a9dbf08442e1d6ed282a20e4b922b0b415ac2b72b3a17'),
  ('star-princess-filtered-source-2026-11-07', 'passion-lilly', 'bellinis-cocktail-bar', 'eb72e6454d7be237e398baab074e041dcbb006245e18572d6f1a24cdb9a8838f'),
  ('star-princess-filtered-source-2026-11-07', 'passion-lilly', 'cascade-bar', '9e5b0feb40d2ef36b82bdbd9e142f64f3d2e0cc458f7743641ebf9d93416a58f'),
  ('star-princess-filtered-source-2026-11-07', 'passion-of-the-irish', 'omalleys-irish-pub', '5778cf69193fcf694042b26bc6921eb736c2d23e380c7a5da770b030c1683998'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'cascade-bar', 'cf346d11f420840e3a0056de047557a607b41d1d90ca1cb65a8ab3a80eb15619'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'lido-bar', 'bf97e25311cb25136d79c6eee92e2fbfba515d7d17a0920564a9ee69825baf9d'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'promenade-bars', '61ecdb5d50511e098152622d892066a3298b3195b6f74439f958e11ce35f5fc3'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'sea-view-bar', '86116ac0023db78b4e5850d8525ce0f0930adc50fb46251cd4e1d70a98901eec'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'star-bar', 'c759f3a8039f73a53b261a1cf495d795cb836df5eef8f2c16064e3319a8fe9b9'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'the-mix', '8e9d73f6e2c2031f69108c9feae2a1a6887cfe80a3354e31b17b3d817ebe6a8f'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'wake-view-bar', '68dd1bb2edcad8ed87eb1139fee2e9c798afb25de332db963488fc30997239ff'),
  ('star-princess-filtered-source-2026-11-07', 'passion-satisfaction', 'wheelhouse-bar', 'e90ae76188a0f8f145e89a0cc608656c3985ae31b37894afbff2fea1bf62eb13'),
  ('star-princess-filtered-source-2026-11-07', 'passionfruit-tiramisu', 'bellinis-cocktail-bar', '6ef12a6512b85182744910b00448c8dc13a2ccadc90a7de2c0e754033d4b9056'),
  ('star-princess-filtered-source-2026-11-07', 'peanut-butter-and-jelly-carajillo', 'sea-view-bar', 'd2c4f0801daa3cd2f3dc42ac062e481993bf9a22398e3675b65fbfb2b47c0555'),
  ('star-princess-filtered-source-2026-11-07', 'peanut-jungle-ball', 'lido-bar', '953f0ed9184f0505ae58a3398dc7ece908cff0de6aebe4ecbe2a6d646a40c993'),
  ('star-princess-filtered-source-2026-11-07', 'peanut-jungle-ball', 'promenade-bars', '1a3d608e174ea710d10731612e803d996f9bf1a69a339463cb1d444458020b43'),
  ('star-princess-filtered-source-2026-11-07', 'peanut-jungle-ball', 'star-bar', '92bb8691debe5e3a6c0f10de1b9f37c2d93633da9703c4384da758d6d900d6ea'),
  ('star-princess-filtered-source-2026-11-07', 'peanut-jungle-ball', 'the-mix', '1060d0b6d2faa5f7fa99247142d3ddce612ed6ebb81920b7830c620a369a0492'),
  ('star-princess-filtered-source-2026-11-07', 'pineapple-paloma', 'princess-live', '370822626709f69542d7ccba79ea162b171df709ac4a4c8be91ceb540970a170'),
  ('star-princess-filtered-source-2026-11-07', 'raspberry-ing', 'omalleys-irish-pub', 'dd0da7dc36da2a644f2c255caf11a56dee7d18ced6d0c0c6eedd8f00aed711ea'),
  ('star-princess-filtered-source-2026-11-07', 'raspberry-lemonade', 'bellinis-cocktail-bar', '82786fac2d23c7d7bc017406a25965afa1bd2b8e6265a0d7d24ca5c42ff3aa07'),
  ('star-princess-filtered-source-2026-11-07', 'red-ferrari', 'bellinis-cocktail-bar', '5ad1793f5d0977f31a4f58cc293ab4cb0e156df819650bdcc2b6087c3d9dfdc8'),
  ('star-princess-filtered-source-2026-11-07', 'roma', 'bellinis-cocktail-bar', 'e2243c407d2d97e06d7b497724e4b4f1dcc9efcf173781a721042d702e502f73'),
  ('star-princess-filtered-source-2026-11-07', 'rum-brulee', 'crooners', 'd9024c3b215860eaf06c554d4c06549a582e30a12f6531d0e95b8e4f6ee11674'),
  ('star-princess-filtered-source-2026-11-07', 'sand-meets-the-sea', 'wake-view-bar', '3a9e5a320252900d716276775fdd56f05d86810aebf0afd861e34ce012ce9744'),
  ('star-princess-filtered-source-2026-11-07', 'seabreeze-spritz', 'wake-view-bar', 'b097a2feec567b3f0ce90f126b0b65eae785e83ca56741f77113e3426f159f8e'),
  ('star-princess-filtered-source-2026-11-07', 'sgroppini', 'bellinis-cocktail-bar', 'b950218ebe4c95f86e10e5c0884a35c0ac568f18debdbab7855a12b32b413a1f'),
  ('star-princess-filtered-source-2026-11-07', 'slainte-irish-coffee', 'omalleys-irish-pub', '9625bd994b0a14f2e9020477023d719f3d624a2be9266bcac570eb77facfc41b'),
  ('star-princess-filtered-source-2026-11-07', 'southern-bond', 'cascade-bar', '373340d90dfa915e3fc600b6378073391b005c8145d7696cbfdba9e72ccdf8ea'),
  ('star-princess-filtered-source-2026-11-07', 'southern-bond', 'lido-bar', '636586fefdde0484fe7ac352b2210d26e8a16d13cbc26e245c611e979559a4c9'),
  ('star-princess-filtered-source-2026-11-07', 'southern-bond', 'promenade-bars', 'aac88a68ad9256284138ae6fbefdc94a27d8d9fa2af30836ec737b3edaf9ee53'),
  ('star-princess-filtered-source-2026-11-07', 'southern-bond', 'star-bar', 'f4e654e048b6a9eefebef79e323d51c3228822c7ce31779869379156e07bd253'),
  ('star-princess-filtered-source-2026-11-07', 'southern-bond', 'the-mix', 'e4e8e606b6ef6da619061a8f843cda1480c47e6d811b70f6dc821003a13fe1ac'),
  ('star-princess-filtered-source-2026-11-07', 'southern-bond', 'wake-view-bar', 'cce995a569dfb1c927524b014e68800b6919fc1dd7a702153c1ca032cf21b5e3'),
  ('star-princess-filtered-source-2026-11-07', 'southern-bond', 'wheelhouse-bar', '4028d2d04cf38762da224e21ecd8528e98879f1201540f6d04c3b3cb438bdc88'),
  ('star-princess-filtered-source-2026-11-07', 'spank-mint', 'omalleys-irish-pub', '907de6e254533ed9d12f1487240ddf4b1c471f4bc0f473be5b62bb3d6d240ee4'),
  ('star-princess-filtered-source-2026-11-07', 'spank-mint', 'princess-live', 'c1a44a37ab5d01aceb79e43b6d8198ba32e275685dff37287de35dd25fe31f0c'),
  ('star-princess-filtered-source-2026-11-07', 'spicy-mango-margarita', 'sea-view-bar', 'a49143ce8b3e7362db07527df125845a5012be091f9cb61b43456caa02cd889f'),
  ('star-princess-filtered-source-2026-11-07', 'star-signature-tiramisu', 'bellinis-cocktail-bar', 'b0b673c909f61159f9b34cb9155a48a1b7280cfacbf568f3c7c4c7e020834e47'),
  ('star-princess-filtered-source-2026-11-07', 'strawberries-and-cream', 'sea-view-bar', '59295636817082ace550d8a9147753e89061ef10394f7b36d69e7b436b1f4eaa'),
  ('star-princess-filtered-source-2026-11-07', 'strawberry-fields-forever', 'bellinis-cocktail-bar', '7c4f8016a5f6fbb36b19ec9c6429ca1facefdd427b4daa1a4f2b2e9192396869'),
  ('star-princess-filtered-source-2026-11-07', 'strawberry-fields-forever', 'crooners', 'e417b28b39282354be5b6f5c83fcd962294ca08ed67bde01722fd5e957596465'),
  ('star-princess-filtered-source-2026-11-07', 'strawberry-fields-forever', 'wake-view-bar', '93ca4347326cd45f866bf632f085ceac4f070744d712dec3a9fd97012cb95896'),
  ('star-princess-filtered-source-2026-11-07', 'strawberry-fields-forever', 'wheelhouse-bar', '09bb87115aa32d5b75c919304c3aba34bb449c11758b0cb28babb3ed9959ab05'),
  ('star-princess-filtered-source-2026-11-07', 'summer-in-italy', 'bellinis-cocktail-bar', '529c51d0b47c48d0b8b022e355c8c1ae3776fb3afbc3d16b971d8eda37c5b522'),
  ('star-princess-filtered-source-2026-11-07', 'sunsets-on-the-ocean', 'wake-view-bar', '9b55b196eb311c26ba476cfc3a7eb595d74b20047f3b409f492a4c5c5bf74cc7'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'bellinis-cocktail-bar', 'af233fb576c28d3519dcefa205fb57369dd4ad1372aa73975d4ebacba59bce3f'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'cascade-bar', '779d34d0164ae4cf2c5b12c27bb0570bc91097adec1c78fc8160e5c868aafaaa'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'crooners', '4ab0831ef5e09e8b8f004bce41b6bb5467b5661fcab04eea156c501600a2ee35'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'lido-bar', '1096b8eae9b085050946e63540bf876a775b9d2e3e66aac3dfda8f6cadfa5d2c'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'princess-live', '65dc5d0fe29d0576534196c3253fdb1474714cf02140750053fe0f498f0b6f93'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'promenade-bars', 'e2ba037ab36d3a43050494f2acf15d2614a05b8e1cc69934445f6635857475ac'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'sea-view-bar', 'db4a3d6b4d777b39e0f37b9c6688b9d2af78ae721f1e97dfe54031dc9873bc65'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'star-bar', '6469c38462f9b3e325579de46133f0839e67ad4d5ca19e16685aca83caf329df'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'the-mix', '2df7818a15d090a9f0506d71730991a1da332d9f802e98f49212d48efadb9fa3'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'wake-view-bar', '485bfc0b1c9e81a4b58eb458e7057451d6fca3500e41ed05b84dcf3d87bac132'),
  ('star-princess-filtered-source-2026-11-07', 'sweetest-sounds', 'wheelhouse-bar', '60c853f632ed3fd2ba2c4df9e69b99d109d2cb31a907552f30718ee578f8aacf'),
  ('star-princess-filtered-source-2026-11-07', 'the-lucky-charm', 'omalleys-irish-pub', 'a6fb6a28bc87fb9d430c0b037d2033c6352f53e3ce77edb3740cc5065b0efae6'),
  ('star-princess-filtered-source-2026-11-07', 'the-original-carajillo', 'sea-view-bar', 'c1a599c01fce663fdb2d306457de06a7357694e2475beaf4ccf48152c897cfc8'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'bellinis-cocktail-bar', '41184c82d389eb5ed5c75205ed6167d933b61e5bb667321aa712b1fabfe0f54c'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'crooners', '72e5d4ef11684c2eda2b94fd707c0f9800344fb6f34a37b42324d97c2cf0504b'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'lido-bar', 'cca5dbee558cbc2495b7e1cbf60c439dd3fc320894c427a0f019516ed0b7dcec'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'omalleys-irish-pub', '0ebd67b089238ecef7320d15877d2be7d121f3c18d7a8d6b51f084303352d46a'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'promenade-bars', 'd01f2134168008bb6396764ba9f12783ba92118a17c8299592652af4b15b1ed0'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'star-bar', 'd981991142e0d83deff1d235f0b15e94816eca862d616afb330470c026b235e5'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'the-mix', '7bf605b1fa7f168622765e5320b1338be0192e9721f59fc018bae5f28f26dcdc'),
  ('star-princess-filtered-source-2026-11-07', 'tropical-alibi', 'wheelhouse-bar', '9737e270e9d8c56dafeab17dfeb0f9449ffd796284ca7b813ec1c6512d9fb178'),
  ('star-princess-filtered-source-2026-11-07', 'truly-caliente-fresca', 'lido-bar', '377b4033fddf45efbd5a24cedd14a44ce929d0068a2fd95cf05620a6aa9429b9'),
  ('star-princess-filtered-source-2026-11-07', 'truly-caliente-fresca', 'promenade-bars', '6705bcbfca6a677e1915eff79f1b2e9a3c18a162e819713bdf6250cfe7f6b7c8'),
  ('star-princess-filtered-source-2026-11-07', 'truly-caliente-fresca', 'star-bar', '88c3059ef1720154a3ddc2a4d2f0bfbf0676618c00900f3a74dceb76843b9ee3'),
  ('star-princess-filtered-source-2026-11-07', 'truly-caliente-fresca', 'the-mix', 'c0b0defe6184d82b9949955ba62b48e59fe272b4cd726ed0ce11ddbeed4e1a12'),
  ('star-princess-filtered-source-2026-11-07', 'truly-pineapple-and-coconut-daiquiri', 'lido-bar', '578e930efd64ed815e661fc0b9e009135f48ec73a139bb55d673a9ebbbeb3d18'),
  ('star-princess-filtered-source-2026-11-07', 'truly-pineapple-and-coconut-daiquiri', 'promenade-bars', 'dc945d2cfe8ef9c3f2e3c10d1a2eeef22f2defd8d8818eb647598a5159e1f869'),
  ('star-princess-filtered-source-2026-11-07', 'truly-pineapple-and-coconut-daiquiri', 'star-bar', '10131ce36b49ec6f4832949b0af7c5a9dcb032d42c64aa3a1c17eedd37e83e17'),
  ('star-princess-filtered-source-2026-11-07', 'truly-pineapple-and-coconut-daiquiri', 'the-mix', 'dcc3ce02f2f9461d76d1da453bcc9a255d6a4a8356d85f538a83dfa181cc8b21'),
  ('star-princess-filtered-source-2026-11-07', 'under-the-mango-tree', 'omalleys-irish-pub', 'cfa2cac64832b6212dbb5068c2255083c94bb46244cc7197b36f837c91fc40ad'),
  ('star-princess-filtered-source-2026-11-07', 'under-the-sea', 'sea-view-bar', '503785914e588243af13b5b8f488d147e5583d7d80eedb5460956cf3ecd02975'),
  ('star-princess-filtered-source-2026-11-07', 'wild-berry-spritz', 'princess-live', '35e05750b11e30314eb13eefbea4790abe3bfdeae351dc4a14a4b28f081f34ea')
on conflict (approval_id, drink_key, bar_key) do update
set recipe_fingerprint = excluded.recipe_fingerprint;

create or replace function public.catalog_offering_supports_bounty_eligibility(
  p_bar_key text,
  p_price_status text,
  p_price_usd numeric,
  p_approval_id text,
  p_drink_key text default null,
  p_recipe_fingerprint text default null
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_price_status = 'verified_within_limit'
      and p_price_usd is not null
      and p_price_usd <= 15
      then true
    when p_price_status = 'approved_filtered_within_limit'
      and p_price_usd is null
      and p_approval_id is not null
      and p_drink_key is not null
      and p_recipe_fingerprint is not null
      and p_bar_key = any (public.catalog_price_evidence_approval_bars(p_approval_id))
      and exists (
        select 1
        from public.catalog_category_b_approved_offerings a
        where a.approval_id = p_approval_id
          and a.drink_key = p_drink_key
          and a.bar_key = p_bar_key
          and a.recipe_fingerprint = p_recipe_fingerprint
      )
      then true
    else false
  end;
$$;

revoke all on function public.catalog_offering_supports_bounty_eligibility(text, text, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_offering_supports_bounty_eligibility(text, text, numeric, text, text, text)
  to service_role;

-- Drop old 4-arg overload if present (replace callers below).
drop function if exists public.catalog_offering_supports_bounty_eligibility(text, text, numeric, text);

create or replace function public.catalog_payload_price_evidence_errors(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_drink jsonb;
  v_off jsonb;
  v_approval_id text;
  v_declared text[];
  v_status text;
  v_price numeric;
  v_bar text;
  v_drink_key text;
  v_fp text;
begin
  select coalesce(array_agg(a->>'approval_id'), array[]::text[])
  into v_declared
  from jsonb_array_elements(coalesce(p_payload->'source_notes'->'price_evidence_approvals', '[]'::jsonb)) a;

  for v_drink in select * from jsonb_array_elements(coalesce(p_payload->'drinks', '[]'::jsonb))
  loop
    v_drink_key := v_drink->>'key';
    for v_off in select * from jsonb_array_elements(coalesce(v_drink->'bar_offerings', '[]'::jsonb))
    loop
      v_status := v_off->>'price_status';
      v_bar := v_off->>'bar_key';
      v_price := nullif(v_off->>'price_usd', '')::numeric;
      v_approval_id := nullif(v_off->>'price_evidence_approval_id', '');
      v_fp := nullif(v_off->>'price_evidence_recipe_fingerprint', '');

      if v_status = 'verified_within_limit' and v_price is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'PRICE_STATUS_INCONSISTENT',
          'message', format('Offering %s@%s claims verified_within_limit without exact price_usd.', v_drink_key, v_bar)
        ));
      end if;

      if v_status = 'approved_filtered_within_limit' then
        if v_price is not null then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_INVENTS_PRICE',
            'message', format('Offering %s@%s must keep price_usd null for Category B.', v_drink_key, v_bar)
          ));
        end if;
        if v_approval_id is null
           or cardinality(public.catalog_price_evidence_approval_bars(v_approval_id)) = 0 then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_UNKNOWN_APPROVAL',
            'message', format('Offering %s@%s has unknown/missing price_evidence_approval_id.', v_drink_key, v_bar)
          ));
        elsif not (v_bar = any (public.catalog_price_evidence_approval_bars(v_approval_id))) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_BAR_NOT_AUTHORIZED',
            'message', format('Offering %s@%s bar not authorized under approval %s.', v_drink_key, v_bar, v_approval_id)
          ));
        elsif not exists (
          select 1 from public.catalog_category_b_approved_offerings a
          where a.approval_id = v_approval_id
            and a.drink_key = v_drink_key
            and a.bar_key = v_bar
            and a.recipe_fingerprint = v_fp
        ) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_OFFERING_NOT_IN_SET',
            'message', format('Offering %s@%s not in approved filtered-source set (identity/fingerprint).', v_drink_key, v_bar)
          ));
        elsif not (v_approval_id = any (v_declared)) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'APPROVED_FILTERED_APPROVAL_UNDECLARED',
            'message', format('Offering %s@%s approval %s not declared in source_notes.', v_drink_key, v_bar, v_approval_id)
          ));
        end if;
      elsif v_approval_id is not null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'PRICE_APPROVAL_STATUS_MISMATCH',
          'message', format('Offering %s@%s sets approval_id without approved_filtered_within_limit.', v_drink_key, v_bar)
        ));
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from unnest(v_declared) d
    where cardinality(public.catalog_price_evidence_approval_bars(d)) = 0
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'PRICE_APPROVAL_UNKNOWN',
      'message', 'source_notes.price_evidence_approvals references an unknown approval_id.'
    ));
  end if;

  return v_errors;
end;
$$;

revoke all on function public.catalog_payload_price_evidence_errors(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_payload_price_evidence_errors(jsonb) to service_role;

-- Cocktail / ingredient pools: pass drink_key + fingerprint into eligibility helper.
create or replace function public.catalog_payload_cocktail_pool(p_payload jsonb)
returns table (
  drink_key text,
  bar_key text,
  tier text,
  points integer,
  eligible boolean
)
language sql
stable
set search_path = public
as $$
  select
    c->>'drink_key',
    c->>'designated_bar_key',
    c->>'tier',
    (c->>'points')::integer,
    (
      coalesce((c->>'eligible')::boolean, true)
      and o.kind = 'named_cocktail'
      and public.catalog_offering_supports_bounty_eligibility(
        o.bar_key,
        o.price_status,
        o.price_usd,
        nullif(o.approval_id, ''),
        o.drink_key,
        nullif(o.fingerprint, '')
      )
      and coalesce((
        select (b->>'active')::boolean
        from jsonb_array_elements(p_payload->'bars') b
        where b->>'key' = c->>'designated_bar_key'
        limit 1
      ), false)
    )
  from jsonb_array_elements(p_payload->'cocktail_candidates') c
  left join lateral (
    select
      d->>'key' as drink_key,
      o2->>'bar_key' as bar_key,
      d->>'kind' as kind,
      nullif(o2->>'price_usd', '')::numeric as price_usd,
      o2->>'price_status' as price_status,
      o2->>'price_evidence_approval_id' as approval_id,
      o2->>'price_evidence_recipe_fingerprint' as fingerprint
    from jsonb_array_elements(p_payload->'drinks') d
    cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o2
    where d->>'key' = c->>'drink_key'
      and o2->>'bar_key' = c->>'designated_bar_key'
    limit 1
  ) o on true
$$;

create or replace function public.catalog_payload_ingredient_pool(p_payload jsonb)
returns table (
  ingredient_key text,
  known_bar_count integer,
  distinct_qualifying_drinks integer,
  tier text,
  points integer,
  eligible boolean
)
language sql
stable
set search_path = public
as $$
  with
  active_bars as (
    select b->>'key' as bar_key
    from jsonb_array_elements(p_payload->'bars') b
    where coalesce((b->>'active')::boolean, true)
  ),
  within_limit_offerings as (
    select
      d->>'key' as drink_key,
      o->>'bar_key' as bar_key,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(o->'ingredient_keys', '[]'::jsonb))),
        array[]::text[]
      ) as ingredient_keys
    from jsonb_array_elements(p_payload->'drinks') d
    cross join lateral jsonb_array_elements(coalesce(d->'bar_offerings', '[]'::jsonb)) o
    where d->>'kind' = 'named_cocktail'
      and o->>'bar_key' in (select bar_key from active_bars)
      and public.catalog_offering_supports_bounty_eligibility(
        o->>'bar_key',
        o->>'price_status',
        nullif(o->>'price_usd', '')::numeric,
        nullif(o->>'price_evidence_approval_id', ''),
        d->>'key',
        nullif(o->>'price_evidence_recipe_fingerprint', '')
      )
  ),
  evidence as (
    select
      c->>'ingredient_key' as ingredient_key,
      (c->>'known_bar_count')::integer as known_bar_count,
      (c->>'distinct_qualifying_drinks')::integer as distinct_qualifying_drinks,
      c->>'tier' as tier,
      (c->>'points')::integer as points,
      coalesce((c->>'eligible')::boolean, true) as want_eligible,
      (
        select count(distinct w.bar_key)
        from within_limit_offerings w
        where (c->>'ingredient_key') = any (w.ingredient_keys)
      ) as corr_bars,
      (
        select count(distinct w.drink_key)
        from within_limit_offerings w
        where (c->>'ingredient_key') = any (w.ingredient_keys)
      ) as corr_drinks
    from jsonb_array_elements(p_payload->'ingredient_candidates') c
  )
  select
    e.ingredient_key,
    e.known_bar_count,
    e.distinct_qualifying_drinks,
    e.tier,
    e.points,
    (
      e.want_eligible
      and e.corr_bars >= 2
      and e.corr_drinks >= 1
      and e.known_bar_count = e.corr_bars
      and e.distinct_qualifying_drinks = e.corr_drinks
    ) as eligible
  from evidence e
$$;

revoke all on function public.catalog_payload_cocktail_pool(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_payload_cocktail_pool(jsonb) to service_role;
revoke all on function public.catalog_payload_ingredient_pool(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_payload_ingredient_pool(jsonb) to service_role;
