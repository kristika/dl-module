'use strict'

// external deps 
var ObjectId = require("mongodb").ObjectId;
var BaseManager = require('../base-manager');

// internal deps 
require('mongodb-toolkit');
var DLModels = require('dl-models');
var map = DLModels.map;
var DeliveryOrder = DLModels.purchasing.DeliveryOrder;
var PurchaseOrderManager = require('./purchase-order-manager');
var PurchaseOrderExternalManager = require('./purchase-order-external-manager');
var i18n = require('dl-i18n');

// var PurchaseOrderBaseManager = require('../po/purchase-order-base-manager');
// var DOItem = DLModels.po.DOItem;

module.exports = class DeliveryOrderManager extends BaseManager {
    constructor(db, user) {
        super(db, user);
        this.collection = this.db.use(map.purchasing.collection.DeliveryOrder);
        this.purchaseOrderManager = new PurchaseOrderManager(db, user);
        this.purchaseOrderExternalManager = new PurchaseOrderExternalManager(db, user);
    }

    _getQuery(paging) {
        var deleted = {
            _deleted: false
        };
        var query = paging.keyword ? {
            '$and': [deleted]
        } : deleted;

        if (paging.keyword) {
            var regex = new RegExp(paging.keyword, "i");
            var filteNO = {
                'no': {
                    '$regex': regex
                }
            };
            var filterNRefNo = {
                'refNo': {
                    '$regex': regex
                }
            };
            var filterSupplierName = {
                'supplier.name': {
                    '$regex': regex
                }
            };
            var filterItem = {
                items: {
                    $elemMatch: {
                        'purchaseOrderExternal.no': {
                            '$regex': regex
                        }
                    }
                }
            };
            var $or = {
                '$or': [filteNO, filterNRefNo, filterSupplierName, filterItem]
            };

            query['$and'].push($or);
        }
        return query;
    }

    post(deliveryOrder) {
        return new Promise((resolve, reject) => {
            this._validate(deliveryOrder)
                .then(validDeliveryOrder => {
                    validDeliveryOrder.isPosted = true;
                    this.collection.update(validDeliveryOrder)
                        .then(id => {
                            resolve(id);
                        })
                        .catch(e => {
                            reject(e);
                        });
                })
                .catch(e => {
                    reject(e);
                });
        });
    }

    _validate(deliveryOrder) {
        var errors = {};
        return new Promise((resolve, reject) => {
            var valid = deliveryOrder;
            var now = new Date();

            var getDeliveryderPromise = this.collection.singleOrDefault({
                "$and": [{
                    _id: {
                        '$ne': new ObjectId(valid._id)
                    }
                }, {
                        "no": valid.no
                    }]
            });
            Promise.all([getDeliveryderPromise])
                .then(results => {
                    var _module = results[0];
                    if (!valid.no || valid.no == '')
                        errors["no"] = i18n.__("DeliveryOrder.no.isRequired:%s is required", i18n.__("DeliveryOrder.no._:No"));//"Nomor surat jalan tidak boleh kosong";
                    else if (_module)
                        errors["no"] = i18n.__("DeliveryOrder.no.isExists:%s is already exists", i18n.__("DeliveryOrder.no._:No"));//"Nomor surat jalan sudah terdaftar";

                    if (!valid.date || valid.date == '')
                        errors["date"] = i18n.__("DeliveryOrder.date.isRequired:%s is required", i18n.__("DeliveryOrder.date._:Date"));//"Tanggal surat jalan tidak boleh kosong";
                    else if (valid.date > now)
                        errors["date"] = i18n.__("DeliveryOrder.date.isGreater:%s is greater than today", i18n.__("DeliveryOrder.date._:Date"));//"Tanggal surat jalan tidak boleh lebih besar dari tanggal hari ini";
                    if (!valid.supplierDoDate || valid.supplierDoDate == '')
                        errors["supplierDoDate"] = i18n.__("DeliveryOrder.supplierDoDate.isRequired:%s is required", i18n.__("DeliveryOrder.supplierDoDate._:SupplierDoDate"));//"Tanggal surat jalan supplier tidak boleh kosong";

                    if (!valid.supplierId || valid.supplierId.toString() == '')
                        errors["supplier"] = i18n.__("DeliveryOrder.supplier.name.isRequired:%s is required", i18n.__("DeliveryOrder.supplier.name._:NameSupplier")); //"Nama supplier tidak boleh kosong";

                    if (valid.items && valid.items.length < 1) {
                        errors["items"] = i18n.__("DeliveryOrder.items.isRequired:%s is required", i18n.__("DeliveryOrder.items.name._:Items")); //"Harus ada minimal 1 nomor po eksternal";
                    } else {
                        var deliveryOrderItemErrors = [];
                        var deliveryOrderItemHasError = false;
                        for (var doItem of valid.items || []) {
                            var purchaseOrderExternalItemErrors = [];
                            var purchaseOrderExternalItemHasErrors = false;
                            var purchaseOrderExternalError = {};

                            if (!doItem.purchaseOrderExternal) {
                                purchaseOrderExternalItemHasErrors = true;
                                purchaseOrderExternalError["purchaseOrderExternal"] = i18n.__("DeliveryOrder.items.purchaseOrderExternal.isRequired:%s is required", i18n.__("DeliveryOrder.items.purchaseOrderExternal._:PurchaseOrderExternal")); //"Purchase order external tidak boleh kosong";
                            }

                            for (var doFulfillment of doItem.fulfillments || []) {
                                var fulfillmentError = {};
                                if (!doFulfillment.deliveredQuantity || doFulfillment.deliveredQuantity == 0) {
                                    purchaseOrderExternalItemHasErrors = true;
                                    fulfillmentError["deliveredQuantity"] = i18n.__("DeliveryOrder.items.fulfillments.deliveredQuantity.isRequired:%s is required or not 0", i18n.__("DeliveryOrder.items.fulfillments.deliveredQuantity._:DeliveredQuantity")); //"Jumlah barang diterima tidak boleh kosong";
                                }
                                else if (doFulfillment.deliveredQuantity > doFulfillment.purchaseOrderQuantity) {
                                    purchaseOrderExternalItemHasErrors = true;
                                    fulfillmentError["deliveredQuantity"] = i18n.__("DeliveryOrder.items.fulfillments.deliveredQuantity.isGreater:%s is greater than purchaseOrderQuantity", i18n.__("DeliveryOrder.items.fulfillments.deliveredQuantity._:DeliveredQuantity")); //"Jumlah barang diterima tidak boleh lebih besar dari jumlah barang di po eksternal";
                                }
                                purchaseOrderExternalItemErrors.push(fulfillmentError);
                            }
                            if (purchaseOrderExternalItemHasErrors) {
                                deliveryOrderItemHasError = true;
                                purchaseOrderExternalError["fulfillments"] = purchaseOrderExternalItemErrors;
                            }
                            deliveryOrderItemErrors.push(purchaseOrderExternalError);
                        }
                        if (purchaseOrderExternalItemHasErrors)
                            errors["items"] = deliveryOrderItemErrors;
                    }

                    // 2c. begin: check if data has any error, reject if it has.
                    if (Object.getOwnPropertyNames(errors).length > 0) {
                        var ValidationError = require('../../validation-error');
                        reject(new ValidationError('data does not pass validation', errors));
                    }

                    valid.supplierId = new ObjectId(valid.supplierId);
                    for (var item of valid.items) {
                        item.purchaseOrderExternalId = new ObjectId(item.purchaseOrderExternalId);
                        for (var fulfillment of item.fulfillments) {
                            fulfillment.purchaseOrderId = new ObjectId(fulfillment.purchaseOrderId);
                            fulfillment.productId = new ObjectId(fulfillment.productId);
                        }
                    }
                    if (!valid.stamp)
                        valid = new DeliveryOrder(valid);
                    
                    valid.supplierId = new ObjectId(valid.supplierId);
                    valid.supplier._id = new ObjectId(valid.supplier._id);
                    for (var doItem of valid.items)
                    {
                        doItem.purchaseOrderExternalId = new ObjectId(doItem.purchaseOrderExternalId);
                        doItem.purchaseOrderExternal._id = new ObjectId(doItem.purchaseOrderExternal._id);
                        for(var fulfillment of doItem.fulfillments)
                        {
                            fulfillment.purchaseOrderId = new ObjectId(fulfillment.purchaseOrderId);
                            fulfillment.purchaseOrder._id = new ObjectId(fulfillment.purchaseOrder._id);
                            fulfillment.productId = new ObjectId(fulfillment.productId);
                            fulfillment.product._id = new ObjectId(fulfillment.product._id);
                        }
                    }
                    
                    valid.stamp(this.user.username, 'manager');
                    resolve(valid);
                })
                .catch(e => {
                    reject(e);
                })
        });
    }

    create(deliveryOrder) {
        return new Promise((resolve, reject) => {
            var tasks = [];
            var tasksPoExternal = [];
            var getPurchaseOrderById = [];
            this._validate(deliveryOrder)
                .then(validDeliveryOrder => {
                    validDeliveryOrder.supplierId = new ObjectId(validDeliveryOrder.supplierId);
                    this.collection.insert(validDeliveryOrder)
                        .then(id => {
                            //update PO Internal
                            for (var validDeliveryOrderItem of validDeliveryOrder.items) {
                                for (var fulfillmentItem of validDeliveryOrderItem.fulfillments) {
                                    getPurchaseOrderById.push(this.purchaseOrderManager.getSingleById(fulfillmentItem.purchaseOrder._id));
                                }
                                Promise.all(getPurchaseOrderById)
                                    .then(results => {
                                        for (var result of results) {
                                            var purchaseOrder = result;
                                            for (var poItem of purchaseOrder.items) {
                                                var doItems = validDeliveryOrderItem.fulfillments;
                                                for (var doItem of doItems) {
                                                    if (purchaseOrder._id.equals(doItem.purchaseOrder._id) && poItem.product._id.equals(doItem.product._id)) {

                                                        var fulfillmentObj = {
                                                            deliveryOderNo: validDeliveryOrder.no,
                                                            deliveryOderDeliveredQuantity: doItem.deliveredQuantity,
                                                            deliveryOderDate: validDeliveryOrder.date,
                                                            supplierDoDate: validDeliveryOrder.supplierDoDate
                                                        };
                                                        poItem.fulfillments.push(fulfillmentObj);

                                                        var totalRealize = 0;
                                                        for (var poItemFulfillment of poItem.fulfillments) {
                                                            totalRealize += poItemFulfillment.deliveredQuantity;
                                                        }
                                                        poItem.realizationQuantity = totalRealize;
                                                        if (poItem.realizationQuantity == poItem.dealQuantity)
                                                            poItem.isClosed = true;
                                                        else
                                                            poItem.isClosed = false;
                                                        break;
                                                    }
                                                }
                                            }
                                            for (var poItem of purchaseOrder.items) {
                                                if (poItem.isClosed == true)
                                                    purchaseOrder.isClosed = true;
                                                else {
                                                    purchaseOrder.isClosed = false;
                                                    break;
                                                }
                                            }
                                            tasks.push(this.purchaseOrderManager.update(purchaseOrder));
                                        }

                                        Promise.all(tasks)
                                            .then(results => {
                                                //update PO Eksternal
                                                for (var validDeliveryOrderItem of validDeliveryOrder.items) {
                                                    var purchaseOrderExternal = validDeliveryOrderItem.purchaseOrderExternal;
                                                    var getPurchaseOrderById = [];
                                                    for (var purchaseOrderExternalItem of purchaseOrderExternal.items) {
                                                        // var indexPO = purchaseOrderExternal.items.indexOf(purchaseOrderExternalItem);
                                                        getPurchaseOrderById.push(this.purchaseOrderManager.getSingleById(purchaseOrderExternalItem._id));
                                                    }
                                                    Promise.all(getPurchaseOrderById)
                                                        .then(results => {
                                                            for (var result of results) {
                                                                if (result.isClosed == true)
                                                                    purchaseOrderExternal.isClosed = true;
                                                                else {
                                                                    purchaseOrderExternal.isClosed = false;
                                                                    break;
                                                                }
                                                            }
                                                            purchaseOrderExternal.items = results;
                                                            tasksPoExternal.push(this.purchaseOrderExternalManager.update(purchaseOrderExternal));
                                                        })
                                                        .catch(e => {
                                                            reject(e);
                                                        });

                                                }

                                                Promise.all(tasksPoExternal)
                                                    .then(results => {
                                                        resolve(id);
                                                    })
                                                    .catch(e => {
                                                        reject(e);
                                                    })
                                            })
                                            .catch(e => {
                                                reject(e);
                                            })

                                    })
                                    .catch(e => {
                                        reject(e);
                                    });
                            }

                        })
                        .catch(e => {
                            reject(e);
                        })
                })
                .catch(e => {
                    reject(e);
                })
        });
    }

    getDataDeliveryOrder(no, supplierId, dateFrom, dateTo) {
        return new Promise((resolve, reject) => {
            var query;
            if (no != "undefined" && no != "" && supplierId != "undefined" && supplierId != "" && dateFrom != "undefined" && dateFrom != "" && dateTo != "undefined" && dateTo != "") {
                query = {
                    no: no,
                    supplierId: new ObjectId(supplierId),
                    supplierDoDate:
                    {
                        $gte: dateFrom,
                        $lte: dateTo
                    },
                    _deleted: false
                };
            } else if (no != "undefined" && no != "" && supplierId != "undefined" && supplierId != "") {
                query = {
                    no: no,
                    supplierId: new ObjectId(supplierId),
                    _deleted: false
                };
            } else if (supplierId != "undefined" && supplierId != "") {
                query = {
                    supplierId: new ObjectId(supplierId),
                    _deleted: false
                };
            } else if (no != "undefined" && no != "") {
                query = {
                    no: no,
                    _deleted: false
                };
            } else if (dateFrom != "undefined" && dateFrom != "" && dateTo != "undefined" && dateTo != "") {
                query = {
                    supplierDoDate:
                    {
                        $gte: dateFrom,
                        $lte: dateTo
                    },
                    _deleted: false
                };
            }

            this.collection
                .where(query)
                .execute()
                .then(PurchaseOrder => {
                    resolve(PurchaseOrder);
                })
                .catch(e => {
                    reject(e);
                });
        });
    }

    getQueryBySupplierAndUnit(_paging) {
        var supplierId = _paging.filter.supplierId;
        var unitId = _paging.filter.unitId;

        var filter = {
            "_deleted": false,
            "supplierId": new ObjectId(supplierId),
            "items": {
                $elemMatch: {
                    "fulfillments": {
                        $elemMatch: {
                            "purchaseOrder.unitId": new ObjectId(unitId)
                        }
                    }
                }
            }
        };

        var query = _paging.keyword ? {
            '$and': [filter]
        } : filter;

        if (_paging.keyword) {
            var regex = new RegExp(_paging.keyword, "i");

            var filterNo = {
                'no': {
                    '$regex': regex
                }
            };

            var filterSupplierName = {
                'supplier.name': {
                    '$regex': regex
                }
            };

            var filterUnitDivision = {
                "unit.division": {
                    '$regex': regex
                }
            };
            var filterUnitSubDivision = {
                "unit.subDivision": {
                    '$regex': regex
                }
            };

            var filterDeliveryOrder = {
                "deliveryOrder.no": {
                    '$regex': regex
                }
            };

            var $or = {
                '$or': [filterNo, filterSupplierName, filterUnitDivision, filterUnitSubDivision, filterDeliveryOrder]
            };

            query['$and'].push($or);
        }

        return query;
    }

    readBySupplierAndUnit(paging) {
        var _paging = Object.assign({
            page: 1,
            size: 20,
            order: '_id',
            asc: true
        }, paging);

        return new Promise((resolve, reject) => {
            var query = this.getQueryBySupplierAndUnit(_paging);
            this.collection.find(query).toArray()
                .then(DeliveryOrders => {
                    resolve(DeliveryOrders);
                })
                .catch(e => {
                    reject(e);
                });
        });
    }

}