import json
import re
import requests
from bs4 import BeautifulSoup

r = requests.get('https://login.hr.nl/v1/login');



soup = BeautifulSoup(r.text, 'html.parser')

formData = {
    'username': '',
    'password': '',
    'lt': soup.find('input', {'name': 'lt'})['value'],
    '_eventId': 'submit',
    'credentialsType': 'ldap',
}
response = requests.post(
    'https://login.hr.nl/v1/login', data=formData)

print '' in requests.get('http://hint.hr.nl/nl/Home/').content
