#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
import sys
import gzip
import base64
import json
import os


def read_varint(buf, pos):
    shift = 0
    result = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, pos
        shift += 7


def iter_fields(msg):
    pos = 0
    n = len(msg)
    while pos < n:
        key, pos = read_varint(msg, pos)
        fnum = key >> 3
        wtype = key & 0x07
        if wtype == 0:
            val, pos = read_varint(msg, pos)
            yield fnum, wtype, val
        elif wtype == 1:
            yield fnum, wtype, msg[pos : pos + 8]
            pos += 8
        elif wtype == 2:
            length, pos = read_varint(msg, pos)
            yield fnum, wtype, msg[pos : pos + length]
            pos += length
        elif wtype == 5:
            yield fnum, wtype, msg[pos : pos + 4]
            pos += 4
        else:
            return


def find_field(msg, field_num):
    for fnum, wtype, val in iter_fields(msg):
        if fnum == field_num and wtype == 2:
            return val
    return None


def extract_from_block(data):
    for fnum, wtype, val in iter_fields(data):
        if fnum != 1 or wtype != 2:
            continue
        stx = find_field(val, 4)
        if stx is None:
            continue
        body = find_field(stx, 1)
        if body is None:
            continue
        pub = find_field(body, 77)
        if pub is not None:
            return pub
    return None


def tss_data_json(pub, block_number):
    ledger_id = find_field(pub, 1)
    wraps_key = find_field(pub, 2)
    contributions = []
    for fnum, wtype, val in iter_fields(pub):
        if fnum != 3 or wtype != 2:
            continue
        node_id = 0
        weight = 0
        history_key = b""
        for cnum, ctype, cval in iter_fields(val):
            if cnum == 1 and ctype == 0:
                node_id = cval
            elif cnum == 2 and ctype == 0:
                weight = cval
            elif cnum == 3 and ctype == 2:
                history_key = cval
        contributions.append({
            "nodeId": str(node_id),
            "weight": str(weight),
            "schnorrPublicKey": base64.b64encode(history_key).decode("ascii"),
        })
    if not ledger_id or not wraps_key or not contributions:
        raise ValueError("LedgerIdPublication is missing ledger id, WRAPS key, or node contributions")
    return {
        "ledgerId": base64.b64encode(ledger_id).decode("ascii"),
        "wrapsVerificationKey": base64.b64encode(wraps_key).decode("ascii"),
        "currentRoster": {"rosterEntries": contributions},
        "validFromBlock": str(block_number),
    }


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("usage: extract.py <out.json> <blockFile.blk[.gz]> [...]\n")
        sys.exit(2)
    out = sys.argv[1]
    for path in sys.argv[2:]:
        try:
            with open(path, "rb") as f:
                raw = f.read()
            data = gzip.decompress(raw) if path.endswith(".gz") else raw
            pub = extract_from_block(data)
            if pub is not None:
                block_number = int(os.path.basename(path).split(".", 1)[0])
                with open(out, "w", encoding="utf-8") as o:
                    json.dump(tss_data_json(pub, block_number), o, separators=(",", ":"))
                print("FOUND ledgerIdPublication in %s -> wrote canonical TssData JSON to %s" % (path, out))
                return
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("skip %s: %s\n" % (path, e))
    sys.stderr.write("No ledgerIdPublication found in any input block file\n")
    sys.exit(1)


if __name__ == "__main__":
    main()

# Copied without changes from hiero-ledger/hiero-consensus-node at commit
# f772754d455b470c98253553a102b5ddd4962a6d, write_ledger_id_extractor in
# hedera-node/test-clients/scripts/solo/e2e-block-stream-cutover/solo-078-to-079-cutover.sh
