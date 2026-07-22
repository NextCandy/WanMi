-- 0033_mx_description_trim.sql
-- mx.ooo 是全站最后一条越界简介（50 字符），卡片与手机域名条都会把它截断。
-- 只保留三个词的读法本身，去掉后半句解释，落到 18 字符、与 0032 的短语一致。
-- 以当前值为条件，后台改过则跳过；namesale.cn 的人工简介不在本次范围内。

UPDATE domains SET description = 'Model, dream, star' WHERE full_domain = 'mx.ooo' AND description = 'Model, dream, star — the three readings behind MX.';
