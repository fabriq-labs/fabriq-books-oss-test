--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6 (Debian 17.6-2.pgdg13+1)
-- Dumped by pg_dump version 17.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Data for Name: permission; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_6b2ee793-69d0-41dd-8114-2f8b3866cac0', 'view_089b6608-109d-4c35-80e7-f6f051c11cee', '*', 'write', '2025-04-11 01:33:59.928', '2025-04-11 01:33:59.928', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_6ded3529-0425-4457-9a47-f98b4f941beb', 'view_dba7c339-2634-4e1b-8169-551016c38a12', '*', 'write', '2025-04-11 01:34:00.319', '2025-04-11 01:34:00.319', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_2286952e-57f5-4f87-87af-3745e56c30cb', 'view_2b52d4d1-af85-4c1f-9abf-8a7d167eb748', '*', 'write', '2025-04-11 01:34:00.517', '2025-04-11 01:34:00.517', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_91693822-ba5e-48ac-8886-2b86c5ba1eda', 'view_7fd84263-f007-4f18-ac55-bc4412192edf', '*', 'write', '2025-04-10 18:32:50', '2025-04-10 18:32:50', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_91e2c193-7419-4c98-9015-22bf8ab63b3e', 'view_a5dd54ef-14bb-45f0-8978-cb58074bd7c2', '*', 'write', '2025-04-10 21:34:00', '2025-04-11 14:24:39', NULL, 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_0779aa9c-93cd-4df8-80d4-e645814b8e4b', 'view_a5dd54ef-14bb-45f0-8978-cb58074bd7c2', 'updated_at', 'read', '2025-04-12 12:35:54.593', '2025-04-12 12:35:54.593', 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_b00423fb-b154-4b2b-a057-8e8a76cbb7bc', 'view_a5dd54ef-14bb-45f0-8978-cb58074bd7c2', 'id', 'read', '2025-04-12 12:36:10.998', '2025-04-12 12:36:10.998', 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_98ead692-5864-4be2-9d4a-d32eaca3efb5', 'view_7fd84263-f007-4f18-ac55-bc4412192edf', 'amount', 'read', '2025-04-12 14:08:20.667', '2025-04-12 14:08:20.667', 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_3c1de315-6940-43e0-8921-68ee78b38c78', 'view_089b6608-109d-4c35-80e7-f6f051c11ceg', '*', 'write', '2025-05-01 18:54:40.213', '2025-05-01 18:48:40.782', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_48ccc21c-95e4-474c-8c9f-7e6c1a70e580', 'view_46fa556e-8554-4b2c-8ce1-2680ac179d2e', '*', 'write', '2025-05-01 20:40:31.14', '2025-05-01 20:39:44.745', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_87422608-6833-452b-b1bd-997d310f3440', 'view_9fd968e6-eae7-465f-bfa4-a4d4618b8c7a', '*', 'write', '2025-05-01 20:40:31.14', '2025-05-01 20:39:45.797', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_a2c0ea18-8078-43ff-bf18-18f280add1e1', 'view_b583e88c-5a9f-4e0f-b11e-f0fad0b54cb7', '*', 'write', '2025-05-01 20:40:31.14', '2025-05-01 20:39:46.741', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_a2c0ea18-8078-43ff-bf18-18f280add222', 'view_81ef0fa6-3520-4b4a-a0a0-0cece34208a9', '*', 'write', '2025-05-01 20:40:31.14', '2025-05-01 20:39:46.741', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_4f98220e-759e-4e9c-af9c-8650b32ff99b', 'view_35eca395-ee06-4448-97a7-ff7ca108f2e3', '*', 'write', '2025-05-31 22:28:13.254', '2025-04-11 01:33:59.928', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_57a907e4-aceb-4ab8-9b3b-532379722cb1', 'view_0e6394e6-edfc-4eba-947f-b1e47bc507f1', '*', 'write', '2025-07-13 15:52:11.863', '2025-04-11 01:33:59.928', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_3745936c-1170-4a4f-8e47-8ea6b139dd70', 'view_b1686bd8-3440-40e4-8ab1-6d07bd2968a6', '*', 'write', '2025-08-30 11:39:03.655', '2025-08-30 11:39:03.655', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_85a160b8-31bc-4311-9407-77d2720a18d5', 'view_7075d1c2-b0c2-43e3-bc50-cb268bbb686c', '*', 'write', '2025-08-30 11:39:09.089', '2025-08-30 11:39:09.089', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_9017c38e-c924-45b9-aacd-4cc8e0f3dc03', 'view_967b73fa-86be-4668-bef1-57dd0b1ad726', '*', 'write', '2025-08-30 11:40:13.157', '2025-08-30 11:40:13.157', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_c77ded96-50fa-4e52-a3bf-62d324ebf298', 'view_72040656-3d42-4a1b-a382-0020b44ec532', '*', 'write', '2025-08-30 11:40:18.522', '2025-08-30 11:40:18.522', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_3bfa8bed-0fdb-4c9f-8669-2f110e3cd3c5', 'view_13f8ff0f-0caf-4505-b504-a4e83ea438b8', '*', 'write', '2025-08-30 11:40:22.233', '2025-08-30 11:40:22.233', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_802bdf93-9ed7-46e7-9719-85f98a8bc4b7', 'view_9586adbc-d884-4902-b75b-cb424da7702a', '*', 'write', '2025-08-30 11:40:26.123', '2025-08-30 11:40:26.123', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_4b17f824-37a6-489c-8409-7a4e5d945a05', 'view_e315d6d6-673d-4600-86a6-c7662e7712d4', '*', 'write', '2025-08-30 11:40:30.424', '2025-08-30 11:40:30.424', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_5c071103-e225-4ccd-a894-a2a7965f2db9', 'view_09f8ad0d-b154-4c1f-9b02-49a1c7f652c2', '*', 'write', '2025-08-30 11:40:34.112', '2025-08-30 11:40:34.112', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_b7eab411-2d67-41d6-9628-6a9ea3c1cdc5', 'view_e52aa2d0-b2df-4ee8-b8be-675ee4f6a977', '*', 'write', '2025-08-30 11:40:37.737', '2025-08-30 11:40:37.737', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_26a0f554-7411-4142-af26-1d900f078323', 'view_ae075f50-f2aa-425c-b333-64ad0553337e', '*', 'write', '2025-08-30 11:40:41.482', '2025-08-30 11:40:41.482', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_6c5e1c65-9f20-4c13-811b-e3e3b603f868', 'view_bcc227b6-ac1a-4b49-be07-94667755fdf0', '*', 'write', '2025-08-30 11:40:45.788', '2025-08-30 11:40:45.788', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_6afdf05f-e779-4c73-9c3f-5bcf2faa601d', 'view_7488059b-ed21-48ab-b0ca-1a70ee64ec44', '*', 'write', '2025-08-30 11:40:48.924', '2025-08-30 11:40:48.924', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_37af8a3a-c43b-4c6e-9252-b74111df0ef0', 'view_6b2b1218-835d-4745-b8f6-71cb67be9d7b', '*', 'write', '2025-08-30 11:40:51.968', '2025-08-30 11:40:51.968', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_2724eabb-a6f2-44f8-a5cf-f901c8aa9194', 'view_74c4baaa-c487-42a5-be74-7f6d2009e8ed', '*', 'write', '2025-08-30 11:40:54.924', '2025-08-30 11:40:54.924', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_8d961b2e-5381-4ccb-ba1c-5a66f5948a72', 'view_cb47ffe1-077e-4fb8-ad84-31c0773dfc9a', '*', 'write', '2025-08-30 11:40:58.057', '2025-08-30 11:40:58.057', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_d9847f87-3d58-4353-988b-2ea02e8400b7', 'view_dd6f0e59-9960-4f85-bac2-3233d6d4d213', '*', 'write', '2025-08-30 11:41:01.68', '2025-08-30 11:41:01.68', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_fdfbbafb-17a2-40d8-8886-356193320878', 'view_f1143b5e-c54b-4491-a285-9a93f2274326', '*', 'write', '2025-08-30 11:41:05.244', '2025-08-30 11:41:05.244', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_2dfbc473-c583-4c22-8584-4335f4baf8e5', 'view_8f97a54c-1f0f-4c6a-b9ca-bc67c8319155', '*', 'write', '2025-08-30 11:41:08.935', '2025-08-30 11:41:08.935', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_a9353b7c-6cd3-49f3-a19e-198f51913f94', 'view_12d60d46-e549-4838-bafa-0e715c872e2e', '*', 'write', '2025-08-30 11:41:12.514', '2025-08-30 11:41:12.514', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_586ff4a5-abbf-4f66-b1c9-00986246b8cf', 'view_789d6c68-7ef6-43d7-a5f9-86a0aa446abd', '*', 'write', '2025-08-30 11:41:16.514', '2025-08-30 11:41:16.514', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_7005e32c-18fc-4132-b419-2c57d501611f', 'view_891751ae-6249-4f8c-be81-931fa06526e3', '*', 'write', '2025-08-30 11:41:19.788', '2025-08-30 11:41:19.788', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_6b29adfa-85da-4f21-a86f-c840a44e708d', 'view_06233fcb-b724-4a7f-83db-9e795ee6a30b', '*', 'write', '2025-08-30 11:41:23.475', '2025-08-30 11:41:23.475', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_ef3a0d93-ded1-480f-bb3b-9b2eb5b972c5', 'view_f8190184-dc4b-4657-af00-207c2d57bfc9', '*', 'write', '2025-08-30 11:41:27.166', '2025-08-30 11:41:27.166', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_0d7619d2-1eca-407b-b675-6ee8e8aa34b7', 'view_df855019-ef72-4c8c-8c11-4b0589f4e779', '*', 'write', '2025-08-30 11:41:30.324', '2025-08-30 11:41:30.324', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_4e33191c-4842-491d-ade6-8631d1dd3e65', 'view_9f769b2e-75ef-40d8-a9a8-e5be6c85c69f', '*', 'write', '2025-08-30 11:41:33.729', '2025-08-30 11:41:33.729', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_0703d82d-f428-4b01-a58b-de90e76ede11', 'view_3f78a26e-3268-46c3-af40-eeb78922591c', '*', 'write', '2025-08-30 11:41:36.844', '2025-08-30 11:41:36.844', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_952db4a9-4946-4849-b9c1-26b22ac54c90', 'view_8a5d2a3f-0b26-44d9-b911-a1d60b5e08be', '*', 'write', '2025-08-30 11:41:40.479', '2025-08-30 11:41:40.479', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_ee4503b8-bcb0-4c3c-8dd8-396be10dd7a5', 'view_8b69bfb0-1858-4ad0-b39a-8b3aad1b5b11', '*', 'write', '2025-08-30 11:41:44.167', '2025-08-30 11:41:44.167', NULL, NULL, NULL);
INSERT INTO public.permission (id, view_id, field_name, access, created_at, updated_at, created_by, modified_by, org_id) VALUES ('perm_ee4503b8-bcb0-4c3c-8dd8-396be10dd333', 'view_f3def97d-a1f7-4800-b5ed-acce401e7c8b', '*', 'write', '2025-08-30 11:41:44.167', '2025-08-30 11:41:44.167', NULL, NULL, NULL);


--
-- Data for Name: role; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_47b4b3cf-5660-4b85-96ee-3c456af60f56', 'test', '2025-08-12 08:42:25.934', '2025-08-12 08:42:25.934', '2d9d64e9-634b-41e1-896f-434472283988', '2d9d64e9-634b-41e1-896f-434472283988', '52');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'Super Admin', '2025-04-11 01:33:59.808', '2025-04-11 01:33:59.808', NULL, NULL, '7');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'Admin', '2025-04-11 01:33:59.892', '2025-04-11 01:33:59.892', NULL, NULL, '7');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'Finance Team', '2025-04-11 01:34:06.056', '2025-04-11 01:34:06.056', NULL, NULL, '7');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'Employee', '2025-04-11 01:34:10.954', '2025-04-11 02:35:11.85', NULL, NULL, '7');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_0919d752-97df-4123-97d8-083d92cb273d', 'Expense Manager', '2025-04-11 01:34:10.892', '2025-04-11 13:45:05.451', NULL, 'user_b62fe19a-64f1-4623-b00b-5fce3a5c8c90', '7');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_83c8876b-a13b-4098-84ca-da0832abade3', 'Buyer', '2025-06-03 02:27:08.486', '2025-06-03 02:27:08.486', NULL, NULL, '7');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_f0f5d683-09cc-4bf4-8f99-70ca4769859d', 'Delivery', '2025-06-03 02:27:08.565', '2025-06-03 02:27:08.565', NULL, NULL, '7');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_d8a4959c-9368-4834-a4c3-2b5a8b1b52f3', 'Test', '2025-08-12 15:56:57.822', '2025-08-12 15:56:57.822', 'user_e3aa0c8a-5945-437c-a03f-3503c7d76431', 'user_e3aa0c8a-5945-437c-a03f-3503c7d76431', '8');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_demo1', 'Demo User', '2025-10-25 17:27:17.985', '2025-10-25 17:27:17.985', 'system', 'system', '52');
INSERT INTO public.role (id, name, created_at, updated_at, created_by, modified_by, org_id) VALUES ('role_manager1', 'Manager', '2025-10-25 17:27:20.386', '2025-10-25 17:27:20.386', 'system', 'system', '52');


--
-- Data for Name: role_view; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_037882b8-1514-4a14-8167-a169c48eec62', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_089b6608-109d-4c35-80e7-f6f051c11cee', '2025-04-11 01:34:00.871', '2025-04-11 01:34:00.871', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_a31568aa-352f-4041-acf3-f64c146d9b5e', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_dba7c339-2634-4e1b-8169-551016c38a12', '2025-04-11 01:34:00.942', '2025-04-11 01:34:00.942', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6d24a8e1-3e7f-4875-b811-2509bc1c94d0', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_2b52d4d1-af85-4c1f-9abf-8a7d167eb748', '2025-04-11 01:34:00.997', '2025-04-11 01:34:00.997', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_05e77bb5-80a4-4096-abbc-322477b3ee62', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_a5dd54ef-14bb-45f0-8978-cb58074bd7c2', '2025-04-11 01:34:01.03', '2025-04-11 01:34:01.03', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_84b941a6-3adf-4081-8580-e6cab81de95f', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_7fd84263-f007-4f18-ac55-bc4412192edf', '2025-04-11 02:35:07.736', '2025-04-11 02:35:07.736', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_69c62f2b-3172-4771-98f6-f229d27f0511', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_2b52d4d1-af85-4c1f-9abf-8a7d167eb748', '2025-04-11 12:36:28.994', '2025-04-11 12:36:28.994', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_e7bb8590-8b5d-4b86-a2ec-061dbc616f13', 'role_0919d752-97df-4123-97d8-083d92cb273d', 'view_7fd84263-f007-4f18-ac55-bc4412192edf', '2025-04-11 13:45:03.469', '2025-04-11 13:45:03.469', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_9de04ec1-66ed-492f-95eb-85c454df27c0', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_089b6608-109d-4c35-80e7-f6f051c11ceg', '2025-05-01 18:57:19.098', '2025-05-01 18:56:42.386', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_b30c5e6c-4a0a-43c3-ae11-5c502703761a', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_9fd968e6-eae7-465f-bfa4-a4d4618b8c7a', '2025-05-01 20:38:06.5', '2025-05-01 20:37:02.78', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_f28f6250-4e27-40a8-8852-09c1de132736', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_46fa556e-8554-4b2c-8ce1-2680ac179d2e', '2025-05-01 20:39:24.359', '2025-05-01 20:38:30.944', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_188e0dd9-f34a-4234-a30b-3e863c08c744', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_b583e88c-5a9f-4e0f-b11e-f0fad0b54cb7', '2025-05-01 20:39:24.359', '2025-05-01 20:38:32.18', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6430d32e-6025-4ba7-acd4-0468812cdfc7', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_35b26fd1-7b8b-4aa8-a622-5bbf7906714d', '2025-05-11 15:19:55.113', '2025-05-01 20:38:30.944', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6430d32e-6025-4ba7-acd4-0468812cdf22', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_81ef0fa6-3520-4b4a-a0a0-0cece34208a9', '2025-05-11 15:19:55.113', '2025-05-01 20:38:30.944', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_8ee6b92a-7d5c-4fc6-92d6-b1890c813836', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_35eca395-ee06-4448-97a7-ff7ca108f2e3', '2025-05-31 22:29:12.115', '2025-04-11 01:34:00.871', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_69c62f2b-3172-4771-98f6-f229d27f0512', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_6642a441-39ac-4ee5-8d7b-c27b0c76401c', '2025-04-11 12:36:28.994', '2025-04-11 12:36:28.994', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_bfc8f466-f929-41c2-b925-47304b2a96fa', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_bf8e7aac-e700-4180-9e60-a1444fac97ac', '2025-08-30 16:49:33.015', '2025-04-11 12:36:28.994', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6b8c5618-8fdc-4efc-87ce-2f1f7729171b', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_e110af2c-27df-4039-b599-65e53f9f99be', '2025-08-30 16:50:50.745', '2025-04-11 12:36:28.994', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_926fac01-d042-46ed-b406-7d2fb4b3312e', 'role_83d156bf-0371-4f6d-9e6c-dddf2c6d4020', 'view_0e6394e6-edfc-4eba-947f-b1e47bc507f1', '2025-08-30 16:51:38.185', '2025-04-11 12:36:28.994', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_b20c267e-42b7-486b-a10a-59d7b8ca5825', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_b1686bd8-3440-40e4-8ab1-6d07bd2968a6', '2025-08-30 11:39:07.034', '2025-08-30 11:39:07.034', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6ae080fb-34d3-496c-a2e5-1fdc65c71ab8', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_b1686bd8-3440-40e4-8ab1-6d07bd2968a6', '2025-08-30 11:39:07.855', '2025-08-30 11:39:07.855', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_856cb32c-62f6-46bc-9168-cd4808714ff3', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_b1686bd8-3440-40e4-8ab1-6d07bd2968a6', '2025-08-30 11:39:08.263', '2025-08-30 11:39:08.263', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_92b05ca4-e62f-408e-bec9-e8cc32b4c19d', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_7075d1c2-b0c2-43e3-bc50-cb268bbb686c', '2025-08-30 11:39:11.137', '2025-08-30 11:39:11.137', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_cc953d8c-c39d-497e-b950-4b1bf8216f66', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_7075d1c2-b0c2-43e3-bc50-cb268bbb686c', '2025-08-30 11:39:11.543', '2025-08-30 11:39:11.543', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_37f1aa24-a764-4ae3-b9e3-a5b0a52c93a3', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_7075d1c2-b0c2-43e3-bc50-cb268bbb686c', '2025-08-30 11:39:11.957', '2025-08-30 11:39:11.957', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_05633c4e-0736-4732-acdd-70a6df0c5b2a', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_967b73fa-86be-4668-bef1-57dd0b1ad726', '2025-08-30 11:40:16.494', '2025-08-30 11:40:16.494', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_e9eefc55-24a5-41e5-b3f7-480821a7efa4', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_967b73fa-86be-4668-bef1-57dd0b1ad726', '2025-08-30 11:40:17.315', '2025-08-30 11:40:17.315', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6220d6b6-c4cc-4972-89dd-d028b6538459', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_967b73fa-86be-4668-bef1-57dd0b1ad726', '2025-08-30 11:40:17.671', '2025-08-30 11:40:17.671', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_c213687e-7139-438f-8c84-eebb9adf329d', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_72040656-3d42-4a1b-a382-0020b44ec532', '2025-08-30 11:40:20.592', '2025-08-30 11:40:20.592', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_fa7dde11-adcd-4159-bf9a-7bde886b8085', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_72040656-3d42-4a1b-a382-0020b44ec532', '2025-08-30 11:40:21.002', '2025-08-30 11:40:21.002', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_7d6f596a-8aba-453e-bf95-eb328317ece4', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_72040656-3d42-4a1b-a382-0020b44ec532', '2025-08-30 11:40:21.406', '2025-08-30 11:40:21.406', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_930d6677-cc4c-4ad4-be6a-1c228ff7e545', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_13f8ff0f-0caf-4505-b504-a4e83ea438b8', '2025-08-30 11:40:24.23', '2025-08-30 11:40:24.23', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_b2418a6e-92d0-448d-b1dc-a9b0b90da003', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_13f8ff0f-0caf-4505-b504-a4e83ea438b8', '2025-08-30 11:40:24.686', '2025-08-30 11:40:24.686', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_c0371a5e-51b4-4c9f-9488-30e25b2a0eb4', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_13f8ff0f-0caf-4505-b504-a4e83ea438b8', '2025-08-30 11:40:25.304', '2025-08-30 11:40:25.304', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_1a7c2238-3afa-41b2-b62c-c6ecea344d1d', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_9586adbc-d884-4902-b75b-cb424da7702a', '2025-08-30 11:40:28.581', '2025-08-30 11:40:28.581', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_2c849f98-c882-4202-acda-504ac4fc3223', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_9586adbc-d884-4902-b75b-cb424da7702a', '2025-08-30 11:40:28.998', '2025-08-30 11:40:28.998', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_31e44d3a-445e-4e1e-9fac-47c68f3e433e', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_9586adbc-d884-4902-b75b-cb424da7702a', '2025-08-30 11:40:29.499', '2025-08-30 11:40:29.499', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_d2ca0de8-7310-437b-9e73-5eb94cdc7af1', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_e315d6d6-673d-4600-86a6-c7662e7712d4', '2025-08-30 11:40:32.474', '2025-08-30 11:40:32.474', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_7c27ee02-6add-48da-b950-383c4ac102e5', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_e315d6d6-673d-4600-86a6-c7662e7712d4', '2025-08-30 11:40:32.883', '2025-08-30 11:40:32.883', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_a0b606f9-04ae-407e-ae6c-293a333acd40', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_e315d6d6-673d-4600-86a6-c7662e7712d4', '2025-08-30 11:40:33.293', '2025-08-30 11:40:33.293', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_0a6b98d3-ec1a-42e3-b224-ae4c80fa071a', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_09f8ad0d-b154-4c1f-9b02-49a1c7f652c2', '2025-08-30 11:40:36.16', '2025-08-30 11:40:36.16', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_21715db6-57bb-4a3d-a6f0-a2b8ba26bf20', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_09f8ad0d-b154-4c1f-9b02-49a1c7f652c2', '2025-08-30 11:40:36.579', '2025-08-30 11:40:36.579', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_2730f206-424e-4ca3-87a4-8b4c9fc14fa2', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_09f8ad0d-b154-4c1f-9b02-49a1c7f652c2', '2025-08-30 11:40:36.98', '2025-08-30 11:40:36.98', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6cbcb461-df06-447e-9626-9580977d7b0d', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_e52aa2d0-b2df-4ee8-b8be-675ee4f6a977', '2025-08-30 11:40:39.847', '2025-08-30 11:40:39.847', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_1afc3e63-6056-41a0-ba68-7963cc03dbee', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_e52aa2d0-b2df-4ee8-b8be-675ee4f6a977', '2025-08-30 11:40:40.257', '2025-08-30 11:40:40.257', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_7e093696-02b4-4f75-90e6-889262ac47b2', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_e52aa2d0-b2df-4ee8-b8be-675ee4f6a977', '2025-08-30 11:40:40.667', '2025-08-30 11:40:40.667', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_d0f77dad-452b-426c-8ecb-efeeb7a139ce', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_ae075f50-f2aa-425c-b333-64ad0553337e', '2025-08-30 11:40:43.733', '2025-08-30 11:40:43.733', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_29b06633-03d7-4cd4-8524-295daf5f8b34', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_ae075f50-f2aa-425c-b333-64ad0553337e', '2025-08-30 11:40:44.56', '2025-08-30 11:40:44.56', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_a5c8d242-6cea-4889-a9be-b01bab1a060d', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_ae075f50-f2aa-425c-b333-64ad0553337e', '2025-08-30 11:40:44.968', '2025-08-30 11:40:44.968', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_e3c6256a-43c7-4926-8631-f4f8849aff52', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_bcc227b6-ac1a-4b49-be07-94667755fdf0', '2025-08-30 11:40:47.604', '2025-08-30 11:40:47.604', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_e1b7b938-8fb2-4315-8082-cf3a64e9e681', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_bcc227b6-ac1a-4b49-be07-94667755fdf0', '2025-08-30 11:40:47.942', '2025-08-30 11:40:47.942', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_af2dc031-d02c-4c90-bcdd-c44012440d8e', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_bcc227b6-ac1a-4b49-be07-94667755fdf0', '2025-08-30 11:40:48.274', '2025-08-30 11:40:48.274', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_b82ed125-dbb4-488b-8388-cb130dfa5e33', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_7488059b-ed21-48ab-b0ca-1a70ee64ec44', '2025-08-30 11:40:50.557', '2025-08-30 11:40:50.557', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_5498ebb8-a3c4-4ab9-8db0-6b3fc05cd17d', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_7488059b-ed21-48ab-b0ca-1a70ee64ec44', '2025-08-30 11:40:50.922', '2025-08-30 11:40:50.922', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_f718d307-ca4c-4f70-a0e2-ea469833306e', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_7488059b-ed21-48ab-b0ca-1a70ee64ec44', '2025-08-30 11:40:51.285', '2025-08-30 11:40:51.285', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_79fd37a9-4fec-4272-8dbd-776ad791c519', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_6b2b1218-835d-4745-b8f6-71cb67be9d7b', '2025-08-30 11:40:53.583', '2025-08-30 11:40:53.583', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_8a0599da-c4a1-4f56-b332-d0cc18757336', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_6b2b1218-835d-4745-b8f6-71cb67be9d7b', '2025-08-30 11:40:53.915', '2025-08-30 11:40:53.915', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_ccea1429-b187-4405-8315-02cc0e17d327', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_6b2b1218-835d-4745-b8f6-71cb67be9d7b', '2025-08-30 11:40:54.276', '2025-08-30 11:40:54.276', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_760e015d-f9ee-41d2-92ba-73d7b1996b9e', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_74c4baaa-c487-42a5-be74-7f6d2009e8ed', '2025-08-30 11:40:56.556', '2025-08-30 11:40:56.556', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_c632d7c4-02d6-46be-a5f7-2b2af68685bd', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_74c4baaa-c487-42a5-be74-7f6d2009e8ed', '2025-08-30 11:40:56.905', '2025-08-30 11:40:56.905', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_19ee559c-f449-4d09-b4c7-54401865b3d1', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_74c4baaa-c487-42a5-be74-7f6d2009e8ed', '2025-08-30 11:40:57.236', '2025-08-30 11:40:57.236', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_3167aa27-d623-4188-8efd-75dbf5f63e7d', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_cb47ffe1-077e-4fb8-ad84-31c0773dfc9a', '2025-08-30 11:40:59.967', '2025-08-30 11:40:59.967', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_1382c95a-8c06-48cc-96ab-cdb275206bb4', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_cb47ffe1-077e-4fb8-ad84-31c0773dfc9a', '2025-08-30 11:41:00.627', '2025-08-30 11:41:00.627', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_2db14d35-4b07-4897-9a5b-16daa8d8bc44', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_cb47ffe1-077e-4fb8-ad84-31c0773dfc9a', '2025-08-30 11:41:01.006', '2025-08-30 11:41:01.006', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_f0f6a49d-ee80-43b5-b963-008066bc8974', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_dd6f0e59-9960-4f85-bac2-3233d6d4d213', '2025-08-30 11:41:03.52', '2025-08-30 11:41:03.52', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_d4a6eed9-799d-4835-bfe2-2d92bca1d378', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_dd6f0e59-9960-4f85-bac2-3233d6d4d213', '2025-08-30 11:41:04.019', '2025-08-30 11:41:04.019', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_35e9b872-b5b5-4293-bf58-a068f394d17d', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_dd6f0e59-9960-4f85-bac2-3233d6d4d213', '2025-08-30 11:41:04.428', '2025-08-30 11:41:04.428', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_4ccc2bde-54b4-48b5-86f7-d50d5ff96368', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_f1143b5e-c54b-4491-a285-9a93f2274326', '2025-08-30 11:41:07.293', '2025-08-30 11:41:07.293', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_ce498050-80a2-4c11-83b2-9ce2364145c1', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_f1143b5e-c54b-4491-a285-9a93f2274326', '2025-08-30 11:41:07.714', '2025-08-30 11:41:07.714', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_809cf40c-af83-40de-9e1c-f1e9ab83f21d', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_f1143b5e-c54b-4491-a285-9a93f2274326', '2025-08-30 11:41:08.096', '2025-08-30 11:41:08.096', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_4c68b6a7-2f12-4f3b-9573-57afdb1ea653', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_8f97a54c-1f0f-4c6a-b9ca-bc67c8319155', '2025-08-30 11:41:10.984', '2025-08-30 11:41:10.984', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_f47a9c5c-a0c5-4c91-85bc-0d7e8b20321e', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_8f97a54c-1f0f-4c6a-b9ca-bc67c8319155', '2025-08-30 11:41:11.388', '2025-08-30 11:41:11.388', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_b32fc527-4845-4ce6-935a-8ac6786e6877', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_8f97a54c-1f0f-4c6a-b9ca-bc67c8319155', '2025-08-30 11:41:11.759', '2025-08-30 11:41:11.759', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_3d123a10-89d6-4083-8e94-47d76b11e21c', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_12d60d46-e549-4838-bafa-0e715c872e2e', '2025-08-30 11:41:14.521', '2025-08-30 11:41:14.521', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_f766cdd6-3031-4368-91a6-12d612861259', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_12d60d46-e549-4838-bafa-0e715c872e2e', '2025-08-30 11:41:14.871', '2025-08-30 11:41:14.871', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_65e5e484-0905-4f3e-8afd-9c35594d62f6', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_12d60d46-e549-4838-bafa-0e715c872e2e', '2025-08-30 11:41:15.281', '2025-08-30 11:41:15.281', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_393fe64a-1e68-48c2-b8b1-225dbe710a84', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_789d6c68-7ef6-43d7-a5f9-86a0aa446abd', '2025-08-30 11:41:18.325', '2025-08-30 11:41:18.325', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_5447b2ad-6f59-4e70-be4e-b0db29f4e226', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_789d6c68-7ef6-43d7-a5f9-86a0aa446abd', '2025-08-30 11:41:18.669', '2025-08-30 11:41:18.669', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_07260668-58bc-4731-98b7-d46a8893488f', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_789d6c68-7ef6-43d7-a5f9-86a0aa446abd', '2025-08-30 11:41:19.008', '2025-08-30 11:41:19.008', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_8ad48ae7-9925-4980-8b9b-b82dfe30a8ce', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_891751ae-6249-4f8c-be81-931fa06526e3', '2025-08-30 11:41:21.839', '2025-08-30 11:41:21.839', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_6cbbc38e-bc37-43f0-a3b2-2bbdcdfa5a74', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_891751ae-6249-4f8c-be81-931fa06526e3', '2025-08-30 11:41:22.246', '2025-08-30 11:41:22.246', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_1bc5c0d8-e85f-434f-8510-b567f23db6b8', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_891751ae-6249-4f8c-be81-931fa06526e3', '2025-08-30 11:41:22.603', '2025-08-30 11:41:22.603', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_c7536f70-8e18-492c-8067-a17735208a37', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_06233fcb-b724-4a7f-83db-9e795ee6a30b', '2025-08-30 11:41:25.523', '2025-08-30 11:41:25.523', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_fb4fb838-9d27-4fab-9f28-e794dc38ce18', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_06233fcb-b724-4a7f-83db-9e795ee6a30b', '2025-08-30 11:41:25.937', '2025-08-30 11:41:25.937', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_30034306-dd7d-4a93-8d45-cf7270d7763f', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_06233fcb-b724-4a7f-83db-9e795ee6a30b', '2025-08-30 11:41:26.346', '2025-08-30 11:41:26.346', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_d7d1172c-8243-465f-940b-8fdbd1f9d662', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_f8190184-dc4b-4657-af00-207c2d57bfc9', '2025-08-30 11:41:28.876', '2025-08-30 11:41:28.876', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_662e5ac9-8f74-459c-8544-c5dc8c545348', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_f8190184-dc4b-4657-af00-207c2d57bfc9', '2025-08-30 11:41:29.244', '2025-08-30 11:41:29.244', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_bbe8273d-9859-4932-aeb7-a151b938205c', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_f8190184-dc4b-4657-af00-207c2d57bfc9', '2025-08-30 11:41:29.604', '2025-08-30 11:41:29.604', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_27fd4574-1028-46c8-aa34-64a4bae7f7b3', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_df855019-ef72-4c8c-8c11-4b0589f4e779', '2025-08-30 11:41:32.009', '2025-08-30 11:41:32.009', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_20c69412-0c9e-4a42-8cb4-2738985836e4', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_df855019-ef72-4c8c-8c11-4b0589f4e779', '2025-08-30 11:41:32.698', '2025-08-30 11:41:32.698', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_45f03a70-929d-4129-ba0f-d7a62602ae39', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_df855019-ef72-4c8c-8c11-4b0589f4e779', '2025-08-30 11:41:33.054', '2025-08-30 11:41:33.054', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_2b36be57-9c5e-47bf-bb69-0cca549f5bbe', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_9f769b2e-75ef-40d8-a9a8-e5be6c85c69f', '2025-08-30 11:41:35.486', '2025-08-30 11:41:35.486', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_7a552897-bb77-458f-a615-aff267dbbc52', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_9f769b2e-75ef-40d8-a9a8-e5be6c85c69f', '2025-08-30 11:41:35.831', '2025-08-30 11:41:35.831', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_1eb0081b-b611-4449-a3fc-9364fe0723b2', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_9f769b2e-75ef-40d8-a9a8-e5be6c85c69f', '2025-08-30 11:41:36.151', '2025-08-30 11:41:36.151', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_eaea7777-e4b8-4c2d-aab7-82585f4997c4', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_3f78a26e-3268-46c3-af40-eeb78922591c', '2025-08-30 11:41:38.841', '2025-08-30 11:41:38.841', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_ace35b65-6c0a-4df8-8741-dd5ce1b3c7ed', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_3f78a26e-3268-46c3-af40-eeb78922591c', '2025-08-30 11:41:39.235', '2025-08-30 11:41:39.235', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_da386728-5584-40fc-a2b1-2233edeeb9e8', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_3f78a26e-3268-46c3-af40-eeb78922591c', '2025-08-30 11:41:39.657', '2025-08-30 11:41:39.657', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_3685403a-7fca-4ef9-a783-f3761b764680', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_8a5d2a3f-0b26-44d9-b911-a1d60b5e08be', '2025-08-30 11:41:42.522', '2025-08-30 11:41:42.522', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_d55f0891-a934-40e7-8e24-f66c6190876f', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_8a5d2a3f-0b26-44d9-b911-a1d60b5e08be', '2025-08-30 11:41:42.938', '2025-08-30 11:41:42.938', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_aca820ed-822d-4d58-87f9-56b1b4733b9b', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_8a5d2a3f-0b26-44d9-b911-a1d60b5e08be', '2025-08-30 11:41:43.347', '2025-08-30 11:41:43.347', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_0e0b6082-a7e6-4128-ad00-181ff591a5df', 'role_83c8876b-a13b-4098-84ca-da0832abade3', 'view_8b69bfb0-1858-4ad0-b39a-8b3aad1b5b11', '2025-08-30 11:41:46.215', '2025-08-30 11:41:46.215', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_4086b186-af9d-4524-8225-d953bb4eb9fc', 'role_6ccb8e78-f6cb-4ad5-bb6a-038958a71bad', 'view_8b69bfb0-1858-4ad0-b39a-8b3aad1b5b11', '2025-08-30 11:41:46.625', '2025-08-30 11:41:46.625', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_ec1f2ff9-64e5-4450-abab-8747aaf5638f', 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38', 'view_8b69bfb0-1858-4ad0-b39a-8b3aad1b5b11', '2025-08-30 11:41:47.03', '2025-08-30 11:41:47.03', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_e709beda-706d-40c0-9114-9606a19c5459', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_089b6608-109d-4c35-80e7-f6f051c11ceg', '2025-09-05 22:01:28.262', '2025-09-05 21:59:58.378', NULL, NULL, '1');
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_00bbba10-31a8-4385-8228-e4e0c263d3bb', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_9fd968e6-eae7-465f-bfa4-a4d4618b8c7a', '2025-09-05 21:59:58.378', '2025-09-05 21:59:58.378', NULL, NULL, '1');
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_cf7325ca-5699-44d4-a088-5ac4cdd05224', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_20b36558-abc9-4e3b-901c-1a431d8db5c9', '2025-09-05 22:03:02.339', '2025-09-05 21:59:58.378', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_a891c31e-80ab-49c9-9d0a-bedb72058105', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_46fa556e-8554-4b2c-8ce1-2680ac179d2e', '2025-09-05 22:03:52.469', '2025-09-05 21:59:58.378', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_ca3cfde5-59d3-4a7a-9431-968975a74a7d', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_4c2b7769-7263-43c4-a9bb-7dc10efaa8a8', '2025-09-05 22:11:28.308', '2025-09-05 22:03:52.469', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_3cfc4b2b-f9ba-4389-9d82-9ffeb5a5946b', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_8a5d2a3f-0b26-44d9-b911-a1d60b5e08be', '2025-09-05 22:11:54.819', '2025-09-05 22:03:52.469', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_491b16b5-b719-4be0-b657-4254f40d5b92', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_d63012d4-e1a1-4bb0-aadf-2367d2c6e1d6', '2025-09-05 22:12:30.657', '2025-09-05 22:03:52.469', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_f4dea380-3293-43ad-a67b-6a0ba952325c', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_0498aa82-23bc-4632-af52-73c3d03a8245', '2025-09-05 22:12:59.54', '2025-09-05 22:03:52.469', NULL, NULL, NULL);
INSERT INTO public.role_view (id, role_id, view_id, created_at, updated_at, created_by, modified_by, org_id) VALUES ('rovi_f4dea380-3293-43ad-a67b-6a0ba9523777', 'role_2c4accef-74a0-4b10-9bc9-dcad64442013', 'view_f3def97d-a1f7-4800-b5ed-acce401e7c8b', '2025-09-05 22:12:59.54', '2025-09-05 22:03:52.469', NULL, NULL, NULL);


-- public.account_hierarchy source

CREATE OR REPLACE VIEW public.account_hierarchy
AS WITH RECURSIVE hierarchy AS (
         SELECT account.id,
            account.code,
            account.classification,
            account.name,
            account.type,
            account.parent_account_id,
            account.name::character varying(1000) AS path,
            0 AS level,
            account.org_id,
            account.currency,
            account.legal_entity_id
           FROM public.account
          WHERE account.parent_account_id = ''::text OR account.parent_account_id IS NULL
        UNION ALL
         SELECT a.id,
            a.code,
            a.classification,
            a.name,
            a.type,
            a.parent_account_id,
            (((ah.path::text || ' -> '::text) || a.name))::character varying(1000) AS "varchar",
            ah.level + 1,
            a.org_id,
            a.currency,
            a.legal_entity_id
           FROM public.account a
             JOIN hierarchy ah ON a.parent_account_id = ah.id::text
        )
 SELECT id,
    code,
    classification,
    name,
    type,
    parent_account_id,
    path,
    level,
    org_id,
    currency,
    legal_entity_id
   FROM hierarchy;

-- public.account_balances source

CREATE OR REPLACE VIEW public.account_balances
AS WITH all_balances AS (
         SELECT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            p.value_date,
            p.name,
            ah.org_id,
            sum(COALESCE(p.amount, 0::numeric)) AS debit_amount,
            0 AS credit_amount
           FROM public.account_hierarchy ah
             LEFT JOIN public.posting p ON ah.id::text = p.account_id AND p.org_id = ah.org_id
          GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id, p.value_date, p.name, ah.org_id
        UNION ALL
         SELECT ah.id AS account_id,
            ah.classification,
            ah.path AS account_path,
            ah.name AS account_name,
            ah.type AS account_type,
            ah.level,
            ah.parent_account_id,
            p.value_date,
            p.name,
            ah.org_id,
            0 AS debit_amount,
            sum(COALESCE(p.amount, 0::numeric)) AS credit_amount
           FROM public.account_hierarchy ah
             LEFT JOIN public.posting p ON ah.id::text = p.credit_account_id AND p.org_id = ah.org_id
          GROUP BY ah.id, ah.classification, ah.path, ah.name, ah.type, ah.level, ah.parent_account_id, p.value_date, p.name, ah.org_id
        )
 SELECT account_id,
    classification,
    account_path,
    account_name,
    account_type,
    level,
    parent_account_id,
    value_date,
    name,
    org_id,
    debit_amount,
    credit_amount
   FROM all_balances
  WHERE name !~~ 'Clos%'::text OR name IS NULL;