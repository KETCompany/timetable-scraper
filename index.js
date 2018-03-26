const request = require('request-promise-native');
const cheerio = require('cheerio');
const fs = require('fs');

const Promise = require("bluebird");


const times = [];
const dayOfWeek = [];


const institute = 'cmi'
const calendarWeek = ['kw1', 'kw2', 'kw3', 'kw4']

const scheduleUrl = 'http://misc.hro.nl/roosterdienst/webroosters/'

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

const n2str = (nr) => {
    var str = nr.toString();
    while (str.length < 5) str = "0" + str;
    return (str);
}

const timeTableSelectors = () => {
    return request.get(`${scheduleUrl}CMI/kw3/frames/navbar.htm`)
    .then(resp => cheerio.load(resp, { xmlMode: false }))
    .then($ => {
        const weeks = parseSelector($('[name=week]'))
        const types = parseSelector($('[name=type]'))
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

timeTableSelectors()
.then((obj) => {

    const { classes, weeks } = obj;

    const newClasses = classes.map(c => {
        c.filename = 'c' + n2str(c.value) + '.htm'
        return c;
    })
    const promises = []
    const classWeekOneParser = parseType('c', weeks[0])
    newClasses.forEach((c) => {
        promises.push(classWeekOneParser(c));
    });

    Promise.all(promises)
    .then(console.log);


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
    return request.get(`${scheduleUrl}CMI/kw3/${week.value}/${type}/${entity.filename}`)
        .then(resp => parseSchedule(resp, entity.filename))
        .then(lectures => ({
            type,
            entity,
            week,
            lectures
        }))
}

const parseWeek = (filename) => (id) => {
    return request.get(`${scheduleUrl}CMI/kw3/${week.value}/c/${filename}`)
        .then(parseSchedule)
        .then(lectures => ({
            id,
            lectures
        }))
}




const $ = cheerio.load(fs.readFileSync('./rooster.html'));

const parseSchedule = (response, lala) => {
    const $ = cheerio.load(response);
    const trRows = $($('table').find('tbody')[0]).children();

    const tdDaysOfWeek = $(trRows.slice(0, 1)).children()
    const trRestRows = $(trRows.slice(1));

    tdDaysOfWeek.each((i, day) => {
        if (i > 0) {
            dayOfWeek.push($(day).text().match('[a-zA-Z0-9:-]+')[0]);
        }
    });
    
    function isBlank(str) {
        return (!str || /^\s*$/.test(str));
    }

    let lectures = []


    trRestRows.each((trCount, timeRow) => {
        if ($(timeRow).children().length > 0) {
            let time;
            $(timeRow).children().each((tdCount, _dayColumn) => {
                const dayColumn = $(_dayColumn);
                if (tdCount === 0) {
                    time = $(dayColumn.find('td')[1]).text().match('[a-zA-Z0-9:-]+')[0];
                    times.push(time)
                } else {
                    const lec = dayColumn.text();
                    const lectureDuration = dayColumn[0].attribs.rowspan / 2;
                    if (!isBlank(lec)) {
                        const lectureBody = $(dayColumn.find('tbody')[0]);
                        const arr = lectureBody.children().map((i, item) => $(item).children()).get()
                        if(arr.length > 1) {
                            const tutor = arr[0].text().replace(/  /g, '').split(/[\n]+/).slice(1, -1)
                            if()
                            const rooms = arr[1].text().replace(/  /g, '').split(/[\n,]+/).slice(1, -1)
                            const subjectCode = arr[2].text().replace(/  /g, '').split(/[\n]+/).slice(1, -1)[0]
                            const subjectTitle = arr[arr.length - 1].text().replace(/  /g, '').split(/[\n]+/).slice(1, -1)[0]
                            
                            const lecture = {
                                day: dayOfWeek[tdCount],
                                dayOfWeek: tdCount,
                                startTime: time.split('-')[0],
                                endTime: '',
                                duration: (trCount, lectureDuration, trCount + lectureDuration),
                                tutor,
                                rooms,
                                subjectCode,
                                subjectTitle
                            }
                            lectures.push(lecture);
                        }
                  
                    }
                }
            });
        }
    });
    return lectures;
}


