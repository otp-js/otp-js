import debug from 'debug';
const log = debug('otpjs:transports:ertf:parser:distribution-header');

export function parseDistributionHeader(buff) {
    log('parseHeader(%o)', buff);
    const headerType = buff.readUInt8(1);
    buff = buff.slice(2);

    if (headerType === 68) {
        return parseNormalHeader(buff);
    } else if (headerType === 69) {
        return parseFragmentHeader(buff);
    } else if (headerType === 70) {
        return parseFragmentContinuationHeader(buff);
    } else {
        throw Error(`invalid headerType: ${headerType}`);
    }
}

function parseNormalHeader(buff) {
    log('parseNormalHeader(%o)', buff);
    const atomCacheRefCount = buff.readUInt8(0);
    buff = buff.slice(1);
    log(
        'parseNormalHeader(%o) : atomCacheRefCount : %o',
        buff,
        atomCacheRefCount
    );

    if (atomCacheRefCount > 0) {
        const pendingBytes = Math.floor(atomCacheRefCount / 2) + 1;
        log(
            'parseNormalHeader(%o) : atomCacheRefFlags.pendingBytes : %o',
            buff,
            pendingBytes
        );
        return parseAtomCacheRefFlags(buff, atomCacheRefCount, pendingBytes);
    } else {
        return [{}, buff];
    }
}

function parseAtomCacheRefFlags(buff, atomCacheRefCount, pendingBytes) {
    log(
        'parseAtomCacheRefFlags(pending: %o, buff: %o)',
        atomCacheRefCount,
        buff
    );
    try {
        const atomCacheRefFlags = buff.slice(0, pendingBytes);
        buff = buff.slice(pendingBytes);

        let atomFlags = atomCacheRefFlags.readUInt8(
            atomCacheRefFlags.length - 1
        );
        if (atomCacheRefCount % 2 == 0) {
            atomFlags &= 0x0f;
        } else {
            atomFlags >>= 4;
        }
        log('parseAtomCacheRefFlags(atomFlags: %s)', atomFlags.toString(2));

        let hasLongAtoms = atomFlags & 0x01;

        log(
            'parseAtomCacheRefFlags(pending: %o, buff: %o) : hasLongAtoms : %o',
            atomCacheRefCount,
            buff,
            hasLongAtoms
        );

        return parseAtomCacheRefs(
            buff,
            atomCacheRefCount,
            atomCacheRefFlags,
            hasLongAtoms
        );
    } catch (err) {
        log('parseAtomCacheRefFlags(%o) : error : %o', buff, err);
        throw err;
    }
}
function parseAtomCacheRefs(
    buff,
    atomCacheRefCount,
    atomCacheRefFlags,
    hasLongAtoms
) {
    const atomCache = [];
    let processedAtomCacheRefs = 0;
    let flags = refreshFlags();
    while (processedAtomCacheRefs < atomCacheRefCount) {
        const nextBuff = parseAtomCacheRef(
            buff,
            flags,
            hasLongAtoms,
            atomCache
        );

        processedAtomCacheRefs++;
        flags = refreshFlags();
        buff = nextBuff;
    }

    return [{ atomCache }, buff];

    function refreshFlags() {
        const flagIndex = Math.floor(processedAtomCacheRefs / 2);
        const high = processedAtomCacheRefs % 2 === 0 ? false : true;

        log(
            'parseAtomCacheRefs() : refreshFlags(processedAtomCacheRefs: %o, flagIndex: %o, high: %o)',
            processedAtomCacheRefs,
            flagIndex,
            high
        );

        let flags = atomCacheRefFlags.readUInt8(flagIndex);
        if (high) {
            flags >>= 4;
        }
        flags &= 0xf;
        return flags;
    }
}
function parseAtomCacheRef(buff, flags, hasLongAtoms, atomCache) {
    const internalSegmentIndex = buff.readUInt8(0);
    const segmentIndex = flags & 0b0111;
    const newCacheEntry = flags & 0b1000;
    const lengthSize = hasLongAtoms ? 2 : 1;

    buff = buff.slice(1);

    log(
        'parseAtomCacheRef(flags: %s, hasLongAtoms: %o)',
        flags.toString(2),
        hasLongAtoms
    );

    if (newCacheEntry) {
        const length = hasLongAtoms ? buff.readUInt16BE(0) : buff.readUInt8(0);
        log('parseAtomCacheRef(length: %o, buff: %o)', length, buff);
        const atomText = buff.slice(lengthSize, lengthSize + length);
        log('atomCache.push([%d, %s])', internalSegmentIndex, atomText);
        atomCache.push([internalSegmentIndex, atomText]);
        buff = buff.slice(lengthSize + length);
        return buff;
    } else {
        return buff;
    }
}
