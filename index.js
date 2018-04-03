require('dotenv').config();

const request = require('request-promise-native');
const mongoose = require('./config/mongoose');
const cheerio = require('cheerio');
const fs = require('fs');
const Promise = require("bluebird");
const scheduleParser = require('./utils/schedule-parser');
const Room = require('./models/room.model');

const $ = cheerio;


mongoose.connect();


const times = [];
const dayOfWeek = [];


const institute = process.env.INSTITUTE
const calendarWeek = ['kw1', 'kw2', 'kw3', 'kw4']

const scheduleUrl = process.env.SCHEDULE_URI

const parseSelector = (elem) => {
    return elem.children().map((i, el) => {
        const obj = $(el)[0].attribs;
        obj.text = $(el).text()
        return obj
    }).get()
}

const matchJSObject = (elem, jsText) => {
    const arr = JSON.parse(jsText.match(`var ${elem} (.)*`)[0].replace(`var ${elem} = `, '').replace(';', ''));
    return arr.map((text, value) => ({ text, value: value + 1 }));
}

const n2str = (type, nr) => {
    var str = nr.toString();
    while (str.length < 5) str = "0" + str;
    return (type + str + '.htm');
}

const timeTableSelectors = () => {
    return request.get(`${scheduleUrl}CMI/kw3/frames/navbar.htm`)
    .then(resp => cheerio.load(resp, { xmlMode: false }))
    .then($ => {
        const weeks = parseSelector($('[name=week]'))
        const types = parseSelector($('[name=type]')).reduce((acc, cur) => {
            let id;
            if (cur.text === 'Klassen') {
                id = 'classes'
            } else if (cur.text === "Docenten") {
                id = 'tutors'
            } else {
                id = 'rooms'
            }
            acc[id] = cur.value;
            return acc;
        }, {});
        const jsText = $($('script')[1])[0].children[0].data;
        
        const matchCases = [
            'classes',
            'teachers',
            'rooms'
        ].map((type) => matchJSObject(type, jsText))

        return {
            weeks,
            types,
            classes: matchCases[0],
            teachers: matchCases[1],
            rooms: matchCases[2],
        }
    })
}

const parseEntity = (entity, type, name) => {
    if (type === 'r') {
        return { type: name, ...parseRoom(entity) };
    }
}

const parseRoom = ({value, text}) => {
    const roomSplitted = text.split('.');
    if(roomSplitted.length > 1) {
        let location, floor, number;
        [location, floor, number] = roomSplitted;
        return {
            location,
            floor: parseInt(floor, 10),
            number: parseInt(number, 10),
            value,
            name: text
        }
    }

    return { name: roomSplitted[0], value }
}


timeTableSelectors()
.then((obj) => {
    const { classes, weeks, rooms, types } = obj;

    const promises = []
    const classWeekOneParser = parseType(types.rooms, weeks[0])
    rooms.forEach((c) => {
        promises.push(classWeekOneParser(c));
    });

    Promise.all(promises)
    .then(response => {
        Room.collection.drop()
            .then(Room.collection.insert(response))
            .then(result => {
                console.log('------!> ', result);
            })
    })


    // Promise.all([
    //     ...classes.map(parseWeek(fileName))
    // ])
    // .then(result => {
    //     return result.reduce((obj, lectures) => {
    //         console.log('----> ', lectures);
    //         // obj[lectures.week.value] = 
    //         // return obj
    //     }, {})
    // })
    // .then(result => {
    
    // })
})
.catch(console.log)

const parseType = (type,week) => entity  => {
    const fileName = n2str(type, entity.value)
    const department = 'CMI';
    return request.get(`${scheduleUrl}${department}/kw3/${week.value}/${type}/${fileName}`)
        .then(resp => scheduleParser(resp, type, week))
        .then(({name, booked}) => ({
            ...parseEntity(entity, type, name),
            booked,
            // weeks: [{...week, booked}],
        }))
}

const parseWeek = (filename) => (id) => {
    return request.get(`${scheduleUrl}CMI/kw3/${week.value}/c/${filename}`)
        .then(scheduleParser)
        .then(lectures => ({
            id,
            lectures
        }))
}




// const $ = cheerio.load(fs.readFileSync('./rooster.html'));


