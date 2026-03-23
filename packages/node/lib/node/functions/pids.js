export function install(node) {
    node.addFunction('node', function getNode(pid) {
        if (pid) {
            const nodeId = pid.node;
            return node.exec('getRouterName', [nodeId]);
        } else {
            return node.name;
        }
    });

}
