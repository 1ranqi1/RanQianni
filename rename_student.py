#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把加密课表数据里的学生姓名改掉。
流程：解密 → 改名字 → 用同样的密码重新加密 → 写回 data.js
"""
import base64
import json
import os
import re
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_JS = os.path.join(ROOT, 'class', 'data.js')

OLD_NAME = '张鲲鹏'
NEW_NAME = '染柒'
ITERATIONS = 310000
SALT_LEN = 16
IV_LEN = 12


def derive_key(password: str, salt: bytes, iterations: int) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
    return kdf.derive(password.encode('utf-8'))


def decrypt(payload: dict, password: str):
    salt = base64.b64decode(payload['salt'])
    iv = base64.b64decode(payload['iv'])
    data = base64.b64decode(payload['data'])
    key = derive_key(password, salt, payload['iterations'])
    plain = AESGCM(key).decrypt(iv, data, None)
    return json.loads(plain.decode('utf-8'))


def encrypt(obj, password: str, salt: bytes, iv: bytes, iterations: int) -> dict:
    key = derive_key(password, salt, iterations)
    plain = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    ct = AESGCM(key).encrypt(iv, plain, None)
    return {
        'salt': base64.b64encode(salt).decode('ascii'),
        'iv': base64.b64encode(iv).decode('ascii'),
        'iterations': iterations,
        'data': base64.b64encode(ct).decode('ascii'),
    }


def extract(src: str, name: str):
    """从 data.js 里取出某个导出的对象，返回 (dict, 原始文本)"""
    m = re.search(rf'export const {name} = (\{{.*?\}});', src, re.S)
    if not m:
        raise SystemExit(f'找不到 {name}')
    return json.loads(m.group(1)), m.group(1)


def main() -> int:
    src = open(DATA_JS, encoding='utf-8').read()

    results = {}
    for var, password in (('encrypted', None), ('quickEncrypted', '1')):
        payload, raw = extract(src, var)
        if password is None:
            # encrypted 需要用户密码，试常见的几个
            for guess in ['ranqi', '1ranqi1', '1', 'ranqi1']:
                try:
                    obj = decrypt(payload, guess)
                    password = guess
                    print(f'[{var}] 密码 = "{guess}"')
                    break
                except Exception:
                    continue
            else:
                print(f'[{var}] 无法解密（密码未知），跳过')
                results[var] = None
                continue
        else:
            obj = decrypt(payload, password)
            print(f'[{var}] 密码 = "{password}"（快速通道）')

        before = obj.get('student', '(无 student 字段)')
        if before != OLD_NAME:
            print(f'[{var}] 当前姓名是 "{before}"，不是 "{OLD_NAME}"')
        obj['student'] = NEW_NAME
        results[var] = {
            'obj': obj,
            'password': password,
            'iterations': payload['iterations'],
            'before': before,
        }
        print(f'[{var}] 姓名: {before} → {NEW_NAME}')

    if not any(results.values()):
        print('没有任何一份可以解密，未做修改', file=sys.stderr)
        return 1

    # 重新加密并写回
    new_src = src
    for var, info in results.items():
        if not info:
            continue
        # 复用原 salt/iv（安全性相同，且保持文件结构一致）
        payload, _ = extract(src, var)
        salt = base64.b64decode(payload['salt'])
        iv = base64.b64decode(payload['iv'])
        new_payload = encrypt(info['obj'], info['password'], salt, iv, info['iterations'])
        new_line = f'export const {var} = {json.dumps(new_payload, ensure_ascii=False, separators=(",", ":"))};'
        new_src = re.sub(
            rf'export const {var} = \{{.*?\}};',
            lambda _m, s=new_line: s,
            new_src, count=1, flags=re.S,
        )

    with open(DATA_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_src)
    print(f'\n已写入 {DATA_JS}')

    # 立即回读验证
    print('\n=== 验证 ===')
    check = open(DATA_JS, encoding='utf-8').read()
    for var, info in results.items():
        if not info:
            continue
        payload, _ = extract(check, var)
        obj = decrypt(payload, info['password'])
        ok = obj.get('student') == NEW_NAME
        print(f'[{var}] 解出的姓名 = "{obj.get("student")}"  {"✓" if ok else "✗"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
