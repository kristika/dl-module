"use strict";

var ObjectId = require("mongodb").ObjectId;
require("mongodb-toolkit");
var DLModels = require("dl-models");
var map = DLModels.map;
var generateCode = require("../../../utils/code-generator");
var KanbanManager = require('./kanban-manager');
var FabricQualityControlManager = require('./fabric-quality-control-manager');
var InspectionLotColor = DLModels.production.finishingPrinting.qualityControl.InspectionLotColor;
var BaseManager = require("module-toolkit").BaseManager;
var i18n = require("dl-i18n");
var moment = require('moment');

module.exports = class InspectionLotColorManager extends BaseManager {
    constructor(db, user) {
        super(db, user);
        this.collection = this.db.use(map.production.finishingPrinting.qualityControl.collection.InspectionLotColor);
        this.kanbanManager = new KanbanManager(db, user);
        this.fabricQualityControlManager = new FabricQualityControlManager(db, user);
    }

    _getQuery(paging) {
        var _default = {
            _deleted: false
        },
            pagingFilter = paging.filter || {},
            keywordFilter = {},
            query = {};

        if (paging.keyword) {
            var regex = new RegExp(paging.keyword, "i");
            var orderNoFilter = {
                "kanban.productionOrder.orderNo": {
                    "$regex": regex
                }
            };
            var colorFilter = {
                "kanban.selectedProductionOrderDetail.colorRequest": {
                    "$regex": regex
                }
            };
            var cartFilter = {
                "kanban.cart.cartNumber": {
                    "$regex": regex
                }
            };
            var orderTypeFilter = {
                "kanban.productionOrder.orderType.name": {
                    "$regex": regex
                }
            };
            keywordFilter["$or"] = [orderNoFilter, colorFilter, cartFilter, orderTypeFilter];
        }
        query["$and"] = [_default, keywordFilter, pagingFilter];
        return query;
    }

    _beforeInsert(data) {
        data.code = generateCode();
        return Promise.resolve(data);
    }

    _validate(inspectionLotColor) {

        var errors = {};

        return new Promise((resolve, reject) => {

            var valid = inspectionLotColor;

            var dateNow = new Date();
            var dateNowString = moment(dateNow).format('YYYY-MM-DD');

            var getKanban = valid.kanbanId && ObjectId.isValid(valid.kanbanId) ? this.kanbanManager.getSingleByIdOrDefault(new ObjectId(valid.kanbanId)) : Promise.resolve(null);

            var getFabricQc = valid.fabricQualityControlId && ObjectId.isValid(valid.fabricQualityControlId) ? this.fabricQualityControlManager.getSingleByIdOrDefault(new ObjectId(valid.fabricQualityControlId)) : Promise.resolve(null);

            Promise.all([getKanban, getFabricQc])
                .then(results => {
                    var _kanban = results[0];
                    var _fabricQc = results[1];

                    if (!valid.fabricQualityControlId || valid.fabricQualityControlId.toString() === "")
                        errors["fabricQualityControlId"] = i18n.__("Harus diisi", i18n.__("InspectionLotColor.fabricQualityControlId._:FabricQualityControlId")); //"kanban tidak ditemukan";
                    else if (!_fabricQc)
                        errors["fabricQualityControlId"] = i18n.__("Data Pemeriksaan Defect tidak ditemukan", i18n.__("InspectionLotColor.fabricQualityControlId._:FabricQualityControlId")); //"kanban tidak ditemukan";


                    if (!valid.date || valid.date === '')
                        errors["date"] = i18n.__("Harus diisi", i18n.__("InspectionLotColor.date._:Date")); //"date tidak ditemukan";
                    else {
                        var dateProces = new Date(valid.date);
                        if (dateProces > dateNow)
                            errors["date"] = i18n.__("Tanggal tidak boleh lebih dari tanggal hari ini", i18n.__("InspectionLotColor.date._:Date")); //"date tidak ditemukan";
                    }

                    if (!valid.items || valid.items.length <= 0)
                        errors["items"] = i18n.__("Harus diisi", i18n.__("InspectionLotColor.items._:Items"));
                    else if (valid.items.length > 0) {
                        var itemErrors = [];
                        for (var item of valid.items) {
                            var itemError = {};
                            if (!item.pcsNo || item.pcsNo === "")
                                itemError["pcsNo"] = i18n.__("Harus diisi", i18n.__("InspectionLotColor.items.pcsNo._:Pcs No"));
                            if (!item.grade || item.grade === "")
                                itemError["pcsNo"] = i18n.__("Harus diisi", i18n.__("InspectionLotColor.items.pcsNo._:Pcs No"));
                            if (!item.lot || item.lot === "")
                                itemError["lot"] = i18n.__("Harus diisi", i18n.__("InspectionLotColor.items.lot._:Lot"));
                            if (!item.lot || item.status === "")
                                itemError["status"] = i18n.__("Harus diisi", i18n.__("InspectionLotColor.items.status._:Status"));
                            itemErrors.push(itemError);
                        }
                        for (var item of itemErrors) {
                            if (Object.getOwnPropertyNames(item).length > 0) {
                                errors["items"] = itemErrors;
                                break;
                            }
                        }
                    }

                    if (Object.getOwnPropertyNames(errors).length > 0) {
                        var ValidationError = require('module-toolkit').ValidationError;
                        return Promise.reject(new ValidationError('data does not pass validation', errors));
                    }

                    if (_kanban) {
                        valid.kanban = _kanban;
                        valid.kanbanId = _kanban._id;
                    }

                    if (_fabricQc) {
                        valid.fabricQualityControlCode = _fabricQc.code;
                        valid.fabricQualityControlId = _fabricQc._id;
                    }

                    valid.date = new Date(valid.date);

                    if (!valid.stamp) {
                        valid = new InspectionLotColor(valid);
                    }

                    valid.stamp(this.user.username, "manager");

                    resolve(valid);
                })
                .catch(e => {
                    reject(e);
                });
        });
    }

    getReport(query) {
        var deletedQuery = {
            _deleted: false
        };
        var date = new Date();
        var dateString = moment(date).format('YYYY-MM-DD');
        var dateNow = new Date(dateString);
        var dateBefore = dateNow.setDate(dateNow.getDate() - 30);
        var dateQuery = {
            "date": {
                "$gte": (!query || !query.dateFrom ? (new Date(dateBefore)) : (new Date(query.dateFrom))),
                "$lte": (!query || !query.dateTo ? date : (new Date(query.dateTo + "T23:59")))
            }
        };
        var kanbanQuery = {};
        if (query.kanban) {
            kanbanQuery = {
                "kanbanId": new ObjectId(query.kanban)
            };
        }
        var productionOrderQuery = {};
        if (query.productionOrder) {
            productionOrderQuery = {
                "kanban.productionOrderId": new ObjectId(query.productionOrder)
            }
        }
        var Query = { "$and": [dateQuery, deletedQuery, kanbanQuery, productionOrderQuery] };
        var order = {
            "date": -1
        };
        return this._createIndexes()
            .then((createIndexResults) => {
                return this.collection
                    .where(Query)
                    .order(order)
                    .execute();
            });
    }

    getXls(result, query) {
        var xls = {};
        xls.data = [];
        xls.options = [];
        xls.name = '';

        var index = 0;
        var dateFormat = "DD/MM/YYYY";

        for (var lotColor of result.data) {
            var dateString = '';
            if (lotColor.date) {
                var dateTamp = new Date(lotColor.date);
                var date = new Date(dateTamp.setHours(dateTamp.getHours() + 7));
                dateString = moment(date).format(dateFormat);
            }
            for (var detail of lotColor.items) {
                index++;
                var item = {};
                item["No"] = index;
                item["No Order"] = lotColor.kanban.productionOrder ? lotColor.kanban.productionOrder.orderNo : '';
                item["Konstruksi"] = lotColor.kanban.productionOrder ? `${lotColor.kanban.productionOrder.material.name} / ${lotColor.kanban.productionOrder.materialConstruction.name} / ${lotColor.kanban.productionOrder.yarnMaterial.name} / ${lotColor.kanban.productionOrder.materialWidth}` : '';
                item["Warna"] = lotColor.kanban.selectedProductionOrderDetail ? lotColor.kanban.selectedProductionOrderDetail.colorType ? `${lotColor.kanban.selectedProductionOrderDetail.colorType.name} ${lotColor.kanban.selectedProductionOrderDetail.colorRequest}` : lotColor.kanban.selectedProductionOrderDetail.colorRequest : '';
                item["No Kereta"] = lotColor.kanban ? lotColor.kanban.cart.cartNumber : '';;
                item["Jenis Order"] = lotColor.kanban.productionOrder ? lotColor.kanban.productionOrder.orderType.name : '';;
                item["Tgl Pemeriksaan"] = dateString;
                item["No Pcs"] = detail.pcsNo ? detail.pcsNo : '';
                item["Lot"] = detail.lot ? detail.lot : '';
                item["Status"] = detail.status ? detail.status : '';

                xls.data.push(item);
            }
        }

        xls.options["No"] = "number";
        xls.options["No Order"] = "string";
        xls.options["Konstruksi"] = "string";
        xls.options["Warna"] = "string";
        xls.options["No Kereta"] = "string";
        xls.options["Jenis Order"] = "string";
        xls.options["Tgl Pemeriksaan"] = "string";
        xls.options["No Pcs"] = "string";
        xls.options["Lot"] = "string";
        xls.options["Status"] = "string";

        if (query.dateFrom && query.dateTo) {
            xls.name = `Inspection Lot Color Report ${moment(new Date(query.dateFrom)).format(dateFormat)} - ${moment(new Date(query.dateTo)).format(dateFormat)}.xlsx`;
        }
        else if (!query.dateFrom && query.dateTo) {
            xls.name = `Inspection Lot Color Report ${moment(new Date(query.dateTo)).format(dateFormat)}.xlsx`;
        }
        else if (query.dateFrom && !query.dateTo) {
            xls.name = `Inspection Lot Color Report ${moment(new Date(query.dateFrom)).format(dateFormat)}.xlsx`;
        }
        else
            xls.name = `Inspection Lot Color Report.xlsx`;

        return Promise.resolve(xls);
    }

    _createIndexes() {
        var dateIndex = {
            name: `ix_${map.production.finishingPrinting.qualityControl.collection.InspectionLotColor}__updatedDate`,
            key: {
                _updatedDate: -1
            }
        }

        return this.collection.createIndexes([dateIndex]);
    }
};