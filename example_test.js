// unlimited stack traces through longjohn
var longjohn = require('longjohn');
longjohn.async_trace_limit = -1;
var Q = require('q');
// Q.longStackSupport = true;

var _ = require('lodash/dist/lodash.underscore');

var assert = require('assert');

// These tests are designed to run concurrently
// this means that a test will run as soon as everything
// that it depends on has finished.
// to run a single test do: node test.js [name of test to run]
var test = require('./simple_tests');

var balanced = require('./example');

var fixtures = {
    card: {
        'number': '4111111111111111',
        'expiration_year': '2016',
        'expiration_month': '12'
    },
    bank_account: {
        name: "Miranda Benz",
        account_number: "9900826301",
        routing_number: "021000021",
        type: "checking",
        meta: {
            info: "created another test account",
            test: true
        }
    }
};

test('api_key', function () {
    return balanced.api_key.create().then(function(obj) {
        balanced = balanced.configure(obj.secret);
        return obj;
    });
});

test('marketplace', function (api_key) {
    return balanced.marketplace;
});

test('customer_create', function(marketplace) {
    return marketplace.customers.create();
});

test('card_create', function (marketplace){
    return marketplace.cards.create(fixtures.card);
});

test('bank_account_create', function (marketplace) {
    return marketplace.bank_accounts.create(fixtures.bank_account);
});

test('update_customer', function (customer_create) {
    var cb = this;
    customer_create.name = "testing name";
    return customer_create.save().then(function (c) {
        cb.assert(c.name == 'testing name');
    });
});

test('add_card_to_customer', function(customer_create, card_create) {
    var cb = this;
    return card_create.associate_to_customer(customer_create).then(function () {
        cb.assert(card_create.links.customer === customer_create.id);
        return card_create;
    });
});

test('add_bank_account_to_customer', function(bank_account_create, customer_create) {
    var cb = this;
    return bank_account_create.associate_to_customer(customer_create)
        .then(function () {
            cb.assert(bank_account_create.links.customer == customer_create.id);
        });
});

test('debit_card', function (add_card_to_customer){
    var cb = this;
    return add_card_to_customer.debit({amount: 500});
});


test('hold_card', function (add_card_to_customer) {
    var cb = this;
	console.log('add_card_to_customeradd_card_to_customer', add_card_to_customer);
    return add_card_to_customer.hold({amount: 400});
});

test('string_together', function(marketplace) {
    var c = marketplace.customers.create();
    return marketplace.cards.create({
        'number': '4111111111111111',
        'expiration_year': '2016',
        'expiration_month': '12'
    }).associate_to_customer(c).debit(500);
});

test('filter_customer_debits', function (marketplace) {
    var cb = this;
    var customer = marketplace.customers.create();
    var card = marketplace.cards.create(fixtures.card);
    return card.associate_to_customer(customer).then(function(card) {
        return Q.all([
            card.debit({
                amount: 1234,
                meta: {
                    testing: 'first debit'
                }
            }),
            card.debit({
                amount: 5678,
                meta: {
                    testing: 'second debit',
                }
            })
        ]).then(function (debits) {
			console.log('yoyo', debits);
            return customer.debits.filter('meta.testing', 'first debit').get(0).then(function (first_debit) {
                cb.assert(first_debit.href === debits[0].href);
            });
        });
    });
});

test('test_order_restrictions', function (marketplace) {
    var cb = this;
    var merchant = marketplace.customers.create();
    var merchant_other = marketplace.customers.create();
    var buyer = marketplace.customers.create();
    var order = merchant.orders.create();
    return Q.all([
        marketplace.bank_accounts.create(fixtures.bank_account)
            .associate_to_customer(merchant),
        marketplace.bank_accounts.create(fixtures.bank_account)
            .associate_to_customer(merchant_other),
        marketplace.cards.create(fixtures.card)
            .associate_to_customer(buyer),
        order
    ]).spread(function (merchant_ba, other_ba, card, order) {
        return order.debit_from(card, 5000).then(function (debit) {
            return Q.all([
                merchant_ba.credit({amount: 2500, order: order.href}),
                other_ba.credit({amount: 2000, order: order.href})
                    .then(
                        function () {
                            cb.assert(false);
                        },
                        function (err) {
                            cb.assert(err.toString().indexOf(
                                'is not associated with order customer'
                            ) != -1);
                        }
                    )
            ]);
        });
    });
});


test('delete_card', function (marketplace) {
    // behavior for deleting is getting tweaked slightly soon
    var cb = this;
    marketplace.cards.create(fixtures.card).then(function(card) {
        var href = card.href;
        return card.delete().then(function () {
            return balanced.get(href)
                .catch(function (err) {
                    cb.assert(err);
                    cb();
                });
        });
    });
});

test('verify_bank_account', function (marketplace) {
    var cb = this;
    return marketplace.bank_accounts.create(fixtures.bank_account).then(function (bank_account) {
        cb.assert(bank_account.can_debit == false);
        return bank_account.verify().then(function (verification) {
            return bank_account.confirm(1,1).then(function (bank_account) {
                cb.assert(bank_account.can_debit == true);
            });
        });
    });
});

test('capture_hold', function(hold_card) {
    return hold_card.capture({});
});

test('paging_get_first', function (marketplace) {
    var cb = this;
    var customer = marketplace.customers.create();
    return marketplace.cards.create(fixtures.card)
        .associate_to_customer(customer)
        .then(function (cc) {
            customer.cards.get(0).then(function (c) {
                cb.assert(cc.href == c.href);
                cb();
            });
        });
});

test('paging_all', function (marketplace, add_card_to_customer, customer_create) {
    var cb = this;
    customer_create.cards.then(function (card_page) {
        card_page.all().then(function (arr) {
            cb.assert(arr instanceof Array);
            for(var i=0; i < arr.length; i++) {
                cb.assert(arr[i]._type == 'card')
                cb.assert(arr[i].links.customer == customer_create.id);
            }
            cb();
        });
    })
});

test('paging_none', function (marketplace) {
    var cb = this;
    marketplace.customers.create().cards.get(0).catch(function () {
        cb();
    });
});

test('paging_first', function (customer_create) {
    var cb = this;
   customer_create.cards.first().then(function (a) {
        cb.assert(!a);
        cb();
    });
});

test('api_key_page', function (marketplace) {
    var cb = this;
    balanced.api_key.query.then(function (page) {
        page.all().then(function (arr) {
            cb.assert(arr.length == 1)
            cb.assert(arr[0]._type == 'api_key');
            cb();
        });
    });
});
