#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p,vec2 c,vec2 r){return 1.0-smoothstep(0.35,1.0,length((p-c)/r));}
float lineDistance(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));}
vec2 hunt(float s,float t,float seed){
    // Blood stolen in the night curls from the skirt into the cupped hand.
    return vec2(0.215+0.402*s+0.055*sin(s*5.8+t*1.1+seed)*sin(s*3.141593),
                0.506-0.140*s-0.022*sin(s*8.0-t*1.7)*sin(s*3.141593));
}
vec2 charge(float s,float t,float seed){
    // The discharge leaves the raised claws and snakes into the right forest.
    return vec2(0.718+0.173*s+0.016*sin(s*33.0-t*5.0+seed)*s,
                0.274+0.236*s+0.013*sin(s*47.0+t*3.8)*sin(s*3.141593));
}
void main(){
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(0.0007,0.8/max(u_resolution.x,1.0));
    float t=max(u_time,0.0),seed=fract(u_seed*0.1731)*6.283185;
    // The entire name/class ribbon, emblem, rules and skeletal stat frame
    // remain original texels. The lower art fades before the skeleton hands.
    float art=smoothstep(0.140,0.154,p.y)*(1.0-smoothstep(0.523,0.540,p.y));
    art*=smoothstep(0.015,0.035,p.x)*(1.0-smoothstep(0.968,0.990,p.x));
    art*=smoothstep(1.0,1.17,length((p-vec2(0.108,0.181))/vec2(0.057,0.039)));
    if(art<=0.0){gl_FragColor=scan;return;}
    vec3 color=scan.rgb;
    vec2 metric=vec2(1.0,1.4113);
    float trails=0.0,redMist=0.0,lightning=0.0,arcGlow=0.0,motes=0.0;
    float packet=fract(t*0.43+0.23+seed*0.06);
    float surge=0.48+0.52*pow(0.5+0.5*sin(t*3.4+seed),2.0);
    for(int i=0;i<28;i++){
        float s=float(i)/28.0;
        float sn=s+1.0/28.0;
        vec2 a=hunt(s,t,seed),b=hunt(sn,t,seed);
        float d=lineDistance(p*metric,a*metric,b*metric);
        float flow=0.30+0.70*pow(0.5+0.5*cos(s*29.0-t*6.0+seed),3.0);
        trails=max(trails,(1.0-smoothstep(0.0010,0.0030+aa,d))*flow);
        redMist=max(redMist,exp(-d*d/0.00034)*flow);
        vec2 c=charge(s,t,seed),e=charge(sn,t,seed);
        float cd=lineDistance(p*metric,c*metric,e*metric);
        float delta=abs(s-packet);
        float envelope=0.23+0.77*exp(-delta*delta/0.026);
        lightning=max(lightning,(1.0-smoothstep(0.0005,0.0017+aa,cd))*envelope);
        arcGlow=max(arcGlow,exp(-cd*cd/0.00017)*envelope);
        // Small separated souls travel along the broad crimson ribbon.
        float flight=fract(s*3.43+t*0.21);
        vec2 spark=hunt(flight,t,seed)+vec2(sin(s*97.0+seed)*0.022,cos(s*63.0)*0.013);
        float sd=length((p-spark)*metric);
        motes+=(1.0-smoothstep(0.0008,0.0024+aa,sd))*sin(flight*3.141593)*0.38;
    }
    color*=1.0-redMist*0.15;
    color+=vec3(0.38,0.018,0.20)*redMist*0.44;
    color+=vec3(0.62,0.10,0.39)*trails*0.76+vec3(0.48,0.10,0.30)*motes;
    color+=vec3(0.03,0.27,0.40)*arcGlow*surge;
    color+=vec3(0.20,0.67,0.87)*lightning*surge;
    // The magic originates in the two painted hands, never on the face.
    float palm=oval(p,vec2(0.616,0.363),vec2(0.061,0.027));
    float claw=oval(p,vec2(0.710,0.284),vec2(0.044,0.037));
    float breath=0.5+0.5*sin(t*2.7+seed);
    color+=(1.0-color)*vec3(0.035,0.39,0.66)*(palm+claw)*(0.15+0.35*breath);
    // Low forest fog slides horizontally in the gaps around her silhouette.
    float woods=oval(p,vec2(0.115,0.390),vec2(0.12,0.14))+oval(p,vec2(0.890,0.405),vec2(0.10,0.12));
    float fog=pow(0.5+0.5*sin(p.y*103.0+p.x*16.0-t*2.3+sin(p.x*19.0+t)*1.7),4.0);
    color+=(1.0-color)*vec3(0.025,0.18,0.25)*woods*fog*0.38;
    if(u_is_foil){
        float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float hair=oval(p,vec2(0.544,0.238),vec2(0.198,0.127));
        float silk=oval(p,vec2(0.400,0.490),vec2(0.21,0.096));
        float body=oval(p,vec2(0.510,0.389),vec2(0.16,0.13));
        float face=oval(p,vec2(0.565,0.232),vec2(0.074,0.065));
        float metal=clamp(hair+silk+body*0.7,0.0,1.0)*(1.0-face*0.82);
        metal*=smoothstep(0.05,0.30,lum);
        float phase=p.x*2.9-p.y*3.5+sin(p.y*18.0)*0.13-t*0.16+seed*0.04;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.283185),8.0);
        color*=1.0-metal*0.18;
        color+=(1.0-color)*spectrum*metal*(0.24+0.59*shine);
        // A coloured substrate makes foil legible even with animation stopped.
        vec3 hue=0.5+0.5*cos(6.283185*(p.x*1.4+p.y*0.8-t*0.10+seed*0.04+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        color=mix(color,overlay,0.27);
        color+=spectrum*trails*0.13;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
