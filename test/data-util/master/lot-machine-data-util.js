"use strict";
var _getSert = require("./getsert");
var product = require("./product-data-util");
var machine = require("./machine-data-util");

class LotMachineDataUtil {
    getSert(input) {
        var ManagerType = require("../../../src/managers/master/lot-machine-manager");
        return _getSert(input, ManagerType, (data) => {
            return {
                productId: data.productId,
                machineId: data.machineId,
                lot: data.lot
            };
        });
    }

    getNewData() {
        return Promise.all([product.getRandomTestData(), machine.getTestData()])
            .then((results) => {
                var product = results[0];
                var machine = results[1];

                var now = new Date();
                var stamp = now / 1000 | 0;
                var code = stamp.toString(36);

                var data = {
                    productId: product._id,
                    product: product,
                    machineId: machine._id,
                    machine: machine,
                    rpm: 100,
                    ne: 150,
                    constant: 15,
                    lot: `lot [${code}]`
                };
                return Promise.resolve(data);
            });
    }


    getTestData() {
        return Promise.all[product.getTestData(), machine.getTestData()]
            .then((results) => {
                var product = results[0];
                var machine = results[1];

                var data = {
                    productId: product._id,
                    product: product,
                    machineId: machine._id,
                    machine: machine,
                    rpm: 100,
                    ne: 150,
                    constant: 15,
                    lot: `UT-LOT`
                };
                return this.getSert(data);
            });
    }
}
module.exports = new LotMachineDataUtil();
