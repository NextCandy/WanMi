ALTER TABLE domains ADD COLUMN keywords TEXT NOT NULL DEFAULT '';
ALTER TABLE domain_import_staging ADD COLUMN keywords TEXT NOT NULL DEFAULT '';

UPDATE domains
SET keywords = replace(
  replace(
    replace(
      replace(trim(description), '，', ','),
      '、', ','
    ),
    ', ', ','
  ),
  ' ,', ','
)
WHERE trim(description) != ''
  AND trim(description) NOT IN ('简介待补充', '暂无简介', '这个域名暂未填写公开简介。');
